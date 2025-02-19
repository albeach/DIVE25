import { Router } from 'express';
import { AuthenticatedRequest } from '../types';
import { documentSchemas } from '../validators/documentSchemas';
import { ValidateRequest } from '../middleware/ValidationMiddleware';
import { DocumentController } from '../controllers/DocumentController';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import DocumentAccessMiddleware from '../middleware/DocumentAccess';
import DocumentValidationMiddleware from '../middleware/DocumentValidation';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { ApiResponse } from '../types';

export class DocumentRoutes {
    private static instance: DocumentRoutes;
    private readonly router: Router;
    private readonly controller: DocumentController;
    private readonly access: DocumentAccessMiddleware;
    private readonly validation: DocumentValidationMiddleware;
    private readonly auth: AuthMiddleware;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    public static getInstance(): DocumentRoutes {
        if (!DocumentRoutes.instance) {
            DocumentRoutes.instance = new DocumentRoutes();
        }
        return DocumentRoutes.instance;
    }

    private constructor() {
        this.router = Router();
        this.controller = DocumentController.getInstance();
        this.access = DocumentAccessMiddleware.getInstance();
        this.validation = DocumentValidationMiddleware.getInstance();
        this.auth = AuthMiddleware.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        // Get document by ID
        this.router.get(
            '/:id',
            this.auth.authenticate,
            this.access.validateAccess,
            this.controller.getDocument.bind(this.controller)
        );

        // Search documents
        this.router.get(
            '/',
            this.auth.authenticate,
            this.controller.searchDocuments.bind(this.controller)
        );

        // Create new document
        this.router.post(
            '/',
            this.auth.authenticate,
            ValidateRequest(documentSchemas.create),
            this.validation.validateDocument,
            this.access.validateAccess,
            this.controller.createDocument.bind(this.controller)
        );

        // Update document
        this.router.put(
            '/:id',
            this.auth.authenticate,
            ValidateRequest(documentSchemas.update),
            this.validation.validateDocument,
            this.access.validateAccess,
            this.controller.updateDocument.bind(this.controller)
        );

        // Delete document
        this.router.delete(
            '/:id',
            this.auth.authenticate,
            this.access.validateAccess,
            this.controller.deleteDocument.bind(this.controller)
        );

        this.router.post('/:id/versions',
            ValidateRequest(documentSchemas.createVersion),
            this.wrapRoute(this.handleCreateVersion.bind(this))
        );

        this.router.get('/:id/versions',
            ValidateRequest(documentSchemas.listVersions),
            this.wrapRoute(this.handleListVersions.bind(this))
        );
    }

    public getRouter(): Router {
        return this.router;
    }

    private async handleCreateVersion(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            await this.controller.createVersion(req, res);

            await this.metrics.recordHttpRequest(
                req.method,
                req.path,
                201,
                Date.now() - startTime
            );
        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    private async handleListVersions(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            await this.controller.listVersions(req, res);

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

export default DocumentRoutes.getInstance();