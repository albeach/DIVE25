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
    ApiResponse 
} from '../types';
import { UserAttributes } from '../services/OPAService';
import { ObjectId } from 'mongodb';

/**
 * Router class that handles all document-related endpoints in the NATO system.
 * Implements secure document operations with proper access controls, validation,
 * and monitoring.
 */
export class DocumentRoutes {
    private static instance: DocumentRoutes;
    private readonly router: Router;
    private readonly documentController: DocumentController;
    private readonly authMiddleware: typeof AuthMiddleware;
    private readonly accessMiddleware: typeof documentAccessMiddleware;
    private readonly validationMiddleware: typeof DocumentValidationMiddleware;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.router = Router();
        this.documentController = DocumentController.getInstance();
        this.authMiddleware = AuthMiddleware;
        this.accessMiddleware = documentAccessMiddleware;
        this.validationMiddleware = DocumentValidationMiddleware;
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        
        this.initializeRoutes();
    }

    public static getInstance(): DocumentRoutes {
        if (!DocumentRoutes.instance) {
            DocumentRoutes.instance = new DocumentRoutes();
        }
        return DocumentRoutes.instance;
    }

    public getRouter(): Router {
        return this.router;
    }

    /**
     * Initializes all document-related routes with proper middleware chains
     * and security controls.
     */
    private initializeRoutes(): void {
        // Apply authentication to all routes
        this.router.use(AuthMiddleware.authenticate as RequestHandler);
        this.router.use(AuthMiddleware.extractUserAttributes as RequestHandler);

        // Search documents
        this.router.post('/search', this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
            const startTime = Date.now();
            
            const searchQuery: DocumentSearchQuery = {
                ...req.body.query,
                maxClearance: req.userAttributes.clearance
            };
        
            const { documents, total } = await this.documentController.searchDocuments(
                searchQuery,
                {
                    page: parseInt(req.query.page as string) || 1,
                    limit: parseInt(req.query.limit as string) || 10
                }
            );
        
            // Record metrics
            this.metrics.recordDocumentOperation('search', {
                duration: Date.now() - startTime,
                resultCount: documents.length
            });
        
            const response: PaginatedResponse<NATODocument> = {
                data: documents,
                pagination: {
                    page: parseInt(req.query.page as string) || 1,
                    limit: parseInt(req.query.limit as string) || 10,
                    total,
                    totalPages: Math.ceil(total / (parseInt(req.query.limit as string) || 10))
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
            this.accessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const startTime = Date.now();
                
                const document = await this.documentController.getDocument(
                    new ObjectId(req.params.id),
                    req.userAttributes
                );

                // Record metrics
                this.metrics.recordDocumentOperation('read', {
                    duration: Date.now() - startTime,
                    documentId: req.params.id
                });

                const response: ApiResponse<NATODocument> = {
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
            this.authMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            this.accessMiddleware as RequestHandler,
            this.validationMiddleware.validateDocument as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const startTime = Date.now();
                
                const document = await this.documentController.createDocument(
                    req.body,
                    req.userAttributes
                );

                // Record metrics
                this.metrics.recordDocumentOperation('create', {
                    duration: Date.now() - startTime,
                    documentId: document._id
                });

                const response: ApiResponse<NATODocument> = {
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
            this.authMiddleware.requireClearance('NATO CONFIDENTIAL') as RequestHandler,
            this.accessMiddleware as RequestHandler,
            this.validationMiddleware.validateDocument as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const startTime = Date.now();
                
                const document = await this.documentController.updateDocument(
                    new ObjectId(req.params.id),
                    req.body,
                    req.userAttributes
                );

                // Record metrics
                this.metrics.recordDocumentOperation('update', {
                    duration: Date.now() - startTime,
                    documentId: req.params.id
                });

                const response: ApiResponse<NATODocument> = {
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
            this.authMiddleware.requireClearance('NATO SECRET') as RequestHandler,
            this.accessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const startTime = Date.now();
                
                await this.documentController.deleteDocument(
                    new ObjectId(req.params.id),
                    req.userAttributes
                );

                // Record metrics
                this.metrics.recordDocumentOperation('delete', {
                    duration: Date.now() - startTime,
                    documentId: req.params.id
                });

                const response: ApiResponse<{ message: string }> = {
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
            this.accessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const startTime = Date.now();
                
                const metadata = await this.documentController.getDocumentMetadata(
                    new ObjectId(req.params.id),
                    req.userAttributes
                );

                // Record metrics
                this.metrics.recordDocumentOperation('metadata', {
                    duration: Date.now() - startTime,
                    documentId: req.params.id
                });

                const response: ApiResponse<typeof metadata> = {
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

        // Get document version history
        this.router.get('/:id/versions',
            this.accessMiddleware as RequestHandler,
            this.wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
                const startTime = Date.now();
                
                const versions = await this.documentController.getDocumentVersions(
                    new ObjectId(req.params.id),
                    req.userAttributes
                );

                // Record metrics
                this.metrics.recordDocumentOperation('versions', {
                    duration: Date.now() - startTime,
                    documentId: req.params.id
                });

                const response: ApiResponse<typeof versions> = {
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

    /**
     * Wraps async route handlers with error handling and logging.
     */
    private wrapAsync(fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>) {
        return (async (req, res, next) => {
            try {
                await fn(req as AuthenticatedRequest, res, next);
            } catch (error) {
                this.logger.error('Route handler error:', {
                    error,
                    path: req.path,
                    method: req.method,
                    userId: req.userAttributes?.uniqueIdentifier,
                    requestId: req.headers['x-request-id']
                });
                this.metrics.recordRouteError(req.path, error);
                next(error);
            }
        }) as RequestHandler;
    }
}

export default DocumentRoutes.getInstance();