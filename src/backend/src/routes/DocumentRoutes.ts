import { Router, Response } from 'express';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import DocumentAccessMiddleware from '../middleware/DocumentAccess';
import DocumentValidationMiddleware from '../middleware/DocumentValidation';
import { DocumentController } from '../controllers/DocumentController';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import {
    AuthenticatedRequest,
    NATODocument,
    ApiResponse,
} from '../types';

export class DocumentRoutes {
    private static _instance: DocumentRoutes | null = null;
    private readonly router: Router;
    private readonly documentController: DocumentController;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly authMiddleware: AuthMiddleware;

    private constructor() {
        this.router = Router();
        this.documentController = DocumentController.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.authMiddleware = AuthMiddleware.getInstance();
        this.initializeRoutes();
    }

    public static getInstance(): DocumentRoutes {
        if (!DocumentRoutes._instance) {
            DocumentRoutes._instance = new DocumentRoutes();
        }
        return DocumentRoutes._instance;
    }

    public getRouter(): Router {
        return this.router;
    }

    private initializeRoutes(): void {
        this.router.use(this.authMiddleware.authenticate);
        this.router.use(this.authMiddleware.extractUserAttributes);

        this.router.get('/:id',
            DocumentAccessMiddleware.validateAccess,
            this.wrapRoute(this.handleGetDocument.bind(this))
        );

        this.router.post('/search',
            this.wrapRoute(this.handleSearchDocuments.bind(this))
        );

        this.router.post('/',
            this.authMiddleware.requireClearance('NATO CONFIDENTIAL'),
            DocumentValidationMiddleware.validateDocument,
            this.wrapRoute(this.handleCreateDocument.bind(this))
        );

        this.router.put('/:id',
            this.authMiddleware.requireClearance('NATO CONFIDENTIAL'),
            DocumentAccessMiddleware.validateAccess,
            DocumentValidationMiddleware.validateDocument,
            this.wrapRoute(this.handleUpdateDocument.bind(this))
        );

        this.router.delete('/:id',
            this.authMiddleware.requireClearance('NATO SECRET'),
            DocumentAccessMiddleware.validateAccess,
            this.wrapRoute(this.handleDeleteDocument.bind(this))
        );
    }

    private async handleGetDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            await this.documentController.getDocument(req, res);

            await this.metrics.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - startTime
            );
        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    private async handleSearchDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            await this.documentController.searchDocuments(req, res);

            await this.metrics.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - startTime
            );
        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    private async handleCreateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const document = await this.documentController.createDocument(
                req.body,
                req.userAttributes
            );

            await this.metrics.recordHttpRequest(
                req.method,
                req.path,
                201,
                Date.now() - startTime
            );

            const response: ApiResponse<NATODocument> = {
                success: true,
                data: document,
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.status(201).json(response);
        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    private async handleUpdateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            await this.documentController.updateDocument(req, res);

            await this.metrics.recordHttpRequest(
                req.method,
                req.path,
                200,
                Date.now() - startTime
            );
        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    private async handleDeleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const deleted = await this.documentController.deleteDocument(
                req.params.id,
                req.userAttributes
            );

            await this.metrics.recordHttpRequest(
                req.method,
                req.path,
                deleted ? 200 : 404,
                Date.now() - startTime
            );

            const response: ApiResponse<{ deleted: boolean }> = {
                success: deleted,
                data: { deleted },
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.status(deleted ? 200 : 404).json(response);
        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    private handleError(error: any, req: AuthenticatedRequest, res: Response): void {
        const statusCode = error.statusCode || 500;

        this.logger.error('Route handling error:', {
            error,
            path: req.path,
            method: req.method,
            userId: req.userAttributes?.uniqueIdentifier
        });

        this.metrics.recordHttpRequest(
            req.method,
            req.path,
            statusCode,
            Date.now() - (req.startTime || Date.now())
        );

        const response: ApiResponse<null> = {
            success: false,
            error: {
                message: error.message || 'Internal server error',
                code: error.code || 'ROUTE_ERROR',
                details: error.details
            },
            metadata: {
                timestamp: new Date(),
                requestId: req.headers['x-request-id'] as string
            }
        };

        res.status(statusCode).json(response);
    }

    private wrapRoute(handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) {
        return async (req: AuthenticatedRequest, res: Response) => {
            req.startTime = Date.now();
            try {
                await handler(req, res);
            } catch (error) {
                this.handleError(error, req, res);
            }
        };
    }
}

export const documentRoutes = DocumentRoutes.getInstance();
export default DocumentRoutes;