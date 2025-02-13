// src/routes/DocumentRoutes.ts

import { Router, Response, NextFunction, RequestHandler } from 'express';
import AuthMiddleware from '../middleware/auth';
import { documentAccessMiddleware } from '../middleware/documentAccess';
import DocumentValidationMiddleware from '../middleware/documentValidation';
import { DocumentController } from '../controllers/DocumentController';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { 
    AuthenticatedRequest, 
    DocumentSearchQuery,
    NATODocument,
    DocumentResponse,
    PaginatedResponse,
    DocumentSearchOptions,
    SearchResult,
    DocumentVersionInfo
} from '../types';

export class DocumentRoutes {
    private router: Router;
    private documentController: DocumentController;
    private logger: LoggerService;
    private metrics: MetricsService;

    constructor() {
        this.router = Router();
        this.documentController = DocumentController.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.initializeRoutes();
    }

    public getRouter(): Router {
        return this.router;
    }

    private initializeRoutes(): void {
        // Apply common middleware
        this.router.use(AuthMiddleware.authenticate as RequestHandler);
        this.router.use(AuthMiddleware.extractUserAttributes as RequestHandler);

        // Search documents
        this.router.post('/search', this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
            const startTime = Date.now();
            
            const searchQuery: DocumentSearchQuery = {
                ...req.body.query,
                maxClearance: req.userAttributes.clearance
            };

            const searchOptions: DocumentSearchOptions = {
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 10,
                sort: req.query.sort ? {
                    field: req.query.sort as string,
                    order: (req.query.order as 'asc' | 'desc') || 'desc'
                } : undefined
            };

            const result: SearchResult<NATODocument> = await this.documentController.searchDocuments(
                searchQuery,
                searchOptions
            );

            // Record metrics
            this.metrics.recordDocumentOperation('search', {
                duration: Date.now() - startTime,
                resultCount: result.documents.length
            });

            const response: PaginatedResponse<NATODocument> = {
                data: result.documents,
                pagination: {
                    page: searchOptions.page,
                    limit: searchOptions.limit,
                    total: result.total,
                    totalPages: Math.ceil(result.total / searchOptions.limit)
                },
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id'] as string
                }
            };

            res.json(response);
        }));

        // Get single document
        this.router.get('/:id', 
            documentAccessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const document = await this.documentController.getDocument(
                    req.params.id,
                    req.userAttributes
                );

                const response: DocumentResponse<NATODocument> = {
                    success: true,
                    data: document,
                    metadata: {
                        timestamp: new Date(),
                        requestId: req.headers['x-request-id'] as string
                    }
                };

                res.json(response);
            })
        );

        // Create document
        this.router.post('/',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            DocumentValidationMiddleware.validateDocument as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const document = await this.documentController.createDocument(
                    req.body,
                    req.userAttributes
                );

                const response: DocumentResponse<NATODocument> = {
                    success: true,
                    data: document,
                    metadata: {
                        timestamp: new Date(),
                        requestId: req.headers['x-request-id'] as string
                    }
                };

                res.status(201).json(response);
            })
        );

        // Update document
        this.router.put('/:id',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            documentAccessMiddleware as RequestHandler,
            DocumentValidationMiddleware.validateDocument as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const document = await this.documentController.updateDocument(
                    req.params.id,
                    req.body,
                    req.userAttributes
                );

                const response: DocumentResponse<NATODocument> = {
                    success: true,
                    data: document,
                    metadata: {
                        timestamp: new Date(),
                        requestId: req.headers['x-request-id'] as string
                    }
                };

                res.json(response);
            })
        );

        // Delete document
        this.router.delete('/:id',
            AuthMiddleware.requireClearance('NATO SECRET') as RequestHandler,
            documentAccessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                await this.documentController.deleteDocument(
                    req.params.id,
                    req.userAttributes
                );

                const response: DocumentResponse<{ message: string }> = {
                    success: true,
                    data: { message: 'Document deleted successfully' },
                    metadata: {
                        timestamp: new Date(),
                        requestId: req.headers['x-request-id'] as string
                    }
                };

                res.json(response);
            })
        );

        // Get document metadata
        this.router.get('/:id/metadata',
            documentAccessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const metadata = await this.documentController.getDocumentMetadata(
                    req.params.id,
                    req.userAttributes
                );

                const response: DocumentResponse<typeof metadata> = {
                    success: true,
                    data: metadata,
                    metadata: {
                        timestamp: new Date(),
                        requestId: req.headers['x-request-id'] as string
                    }
                };

                res.json(response);
            })
        );

        // Get document versions
        this.router.get('/:id/versions',
            documentAccessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const versions = await this.documentController.getDocumentVersions(
                    req.params.id,
                    req.userAttributes
                );

                const response: DocumentResponse<DocumentVersionInfo[]> = {
                    success: true,
                    data: versions,
                    metadata: {
                        timestamp: new Date(),
                        requestId: req.headers['x-request-id'] as string
                    }
                };

                res.json(response);
            })
        );
    }

    private wrapAsync(fn: (req: AuthenticatedRequest, res: Response) => Promise<void>): RequestHandler {
        return (async (req, res, next) => {
            try {
                await fn(req as AuthenticatedRequest, res);
            } catch (error) {
                this.logger.error('Route handler error:', {
                    error,
                    path: req.path,
                    method: req.method,
                    userId: (req as AuthenticatedRequest).userAttributes?.uniqueIdentifier,
                    requestId: req.headers['x-request-id']
                });
                
                if (this.metrics) {
                    this.metrics.recordRouteError(req.path, error as Error);
                }
                
                next(error);
            }
        }) as RequestHandler;
    }
}

export default new DocumentRoutes();