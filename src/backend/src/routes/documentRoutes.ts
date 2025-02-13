// src/routes/DocumentRoutes.ts

import { Router, Response, NextFunction, RequestHandler } from 'express';
import AuthMiddleware from '../middleware/AuthMiddleware';
import DocumentAccessMiddleware from '../middleware/documentAccess';
import DocumentValidationMiddleware from '../middleware/documentValidation';
import { DocumentController } from '../controllers/DocumentController';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { 
    AuthenticatedRequest, 
    DocumentSearchQuery,
    NATODocument,
    ApiResponse,
    SearchResult,
    DocumentMetadata,
    PaginationOptions,
    AuthError
} from '../types';

/**
 * Handles all document-related routes in the NATO document system.
 * Implements secure document operations with proper access controls,
 * validation, and monitoring according to NATO security standards.
 */
export class DocumentRoutes {
    private static instance: DocumentRoutes;
    private readonly router: Router;
    private readonly documentController: DocumentController;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.router = Router();
        this.documentController = DocumentController.getInstance();
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
     * Initializes all document-related routes with proper middleware chains.
     * Each route is protected by appropriate authentication and authorization checks.
     */
    private initializeRoutes(): void {
        // Apply common middleware to all routes
        this.router.use(AuthMiddleware.authenticate);
        this.router.use(AuthMiddleware.extractUserAttributes);

        // Document search endpoint
        this.router.post('/search', this.wrapAsync(this.handleSearch.bind(this)));

        // Single document retrieval
        this.router.get('/:id',
            DocumentAccessMiddleware.validateAccess,
            this.wrapAsync(this.handleGetDocument.bind(this))
        );

        // Document creation
        this.router.post('/',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL'),
            DocumentValidationMiddleware.validateDocument,
            this.wrapAsync(this.handleCreateDocument.bind(this))
        );

        // Document update
        this.router.put('/:id',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL'),
            DocumentAccessMiddleware.validateAccess,
            DocumentValidationMiddleware.validateDocument,
            this.wrapAsync(this.handleUpdateDocument.bind(this))
        );

        // Document deletion
        this.router.delete('/:id',
            AuthMiddleware.requireClearance('NATO SECRET'),
            DocumentAccessMiddleware.validateAccess,
            this.wrapAsync(this.handleDeleteDocument.bind(this))
        );

        // Document metadata retrieval
        this.router.get('/:id/metadata',
            DocumentAccessMiddleware.validateAccess,
            this.wrapAsync(this.handleGetMetadata.bind(this))
        );
    }

    /**
     * Handles document search requests with pagination and security filtering.
     */
    private async handleSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        
        const searchQuery: DocumentSearchQuery = {
            ...req.body.query,
            maxClearance: req.userAttributes.clearance
        };

        const paginationOptions: PaginationOptions = {
            page: parseInt(req.query.page as string) || 1,
            limit: Math.min(parseInt(req.query.limit as string) || 10, 100),
            sort: req.query.sort ? {
                field: req.query.sort as keyof NATODocument,
                order: (req.query.order as 'asc' | 'desc') || 'desc'
            } : undefined
        };

        const result = await this.documentController.searchDocuments(
            searchQuery,
            paginationOptions
        );

        await this.metrics.recordOperationMetrics('document_search', {
            duration: Date.now() - startTime,
            resultCount: result.documents.length,
            userClearance: req.userAttributes.clearance
        });

        const response: ApiResponse<SearchResult<NATODocument>> = {
            success: true,
            data: result,
            metadata: {
                timestamp: new Date(),
                requestId: req.headers['x-request-id'] as string
            }
        };

        res.json(response);
    }

    /**
     * Handles single document retrieval with security checks.
     */
    private async handleGetDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        
        const document = await this.documentController.getDocument(
            req.params.id,
            req.userAttributes
        );

        if (!document) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'DOC_NOT_FOUND',
                    message: 'Document not found'
                }
            });
            return;
        }

        await this.metrics.recordOperationMetrics('document_read', {
            duration: Date.now() - startTime,
            documentId: req.params.id,
            documentClearance: document.clearance
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
    }

    /**
     * Handles document creation with proper security metadata.
     */
    private async handleCreateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        
        const document = await this.documentController.createDocument({
            ...req.body,
            metadata: {
                createdBy: req.userAttributes.uniqueIdentifier,
                createdAt: new Date(),
                lastModified: new Date(),
                version: 1
            }
        });

        await this.metrics.recordOperationMetrics('document_create', {
            duration: Date.now() - startTime,
            documentId: document._id?.toString(),
            documentClearance: document.clearance
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
    }

    /**
     * Handles document updates while maintaining version history.
     */
    private async handleUpdateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        
        const document = await this.documentController.updateDocument(
            req.params.id,
            {
                ...req.body,
                metadata: {
                    lastModified: new Date(),
                    lastModifiedBy: req.userAttributes.uniqueIdentifier
                }
            }
        );

        if (!document) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'DOC_NOT_FOUND',
                    message: 'Document not found'
                }
            });
            return;
        }

        await this.metrics.recordOperationMetrics('document_update', {
            duration: Date.now() - startTime,
            documentId: document._id?.toString(),
            documentClearance: document.clearance
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
    }

    /**
     * Handles document deletion (soft delete).
     */
    private async handleDeleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        
        const success = await this.documentController.deleteDocument(
            req.params.id,
            req.userAttributes
        );

        if (!success) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'DOC_NOT_FOUND',
                    message: 'Document not found'
                }
            });
            return;
        }

        await this.metrics.recordOperationMetrics('document_delete', {
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
    }

    /**
     * Handles document metadata retrieval.
     */
    private async handleGetMetadata(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        
        const metadata = await this.documentController.getDocumentMetadata(
            req.params.id,
            req.userAttributes
        );

        if (!metadata) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'DOC_NOT_FOUND',
                    message: 'Document not found'
                }
            });
            return;
        }

        await this.metrics.recordOperationMetrics('metadata_read', {
            duration: Date.now() - startTime,
            documentId: req.params.id
        });

        const response: ApiResponse<DocumentMetadata> = {
            success: true,
            data: metadata,
            metadata: {
                timestamp: new Date(),
                requestId: req.headers['x-request-id'] as string
            }
        };

        res.json(response);
    }

    /**
     * Wraps async route handlers with unified error handling and logging.
     */
    private wrapAsync(fn: (req: AuthenticatedRequest, res: Response) => Promise<void>): RequestHandler {
        return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            try {
                await fn(req, res);
            } catch (error) {
                this.logger.error('Route handler error:', {
                    error,
                    path: req.path,
                    method: req.method,
                    userId: req.userAttributes?.uniqueIdentifier,
                    requestId: req.headers['x-request-id']
                });

                await this.metrics.recordOperationError(req.path, {
                    error,
                    userId: req.userAttributes?.uniqueIdentifier,
                    operationId: req.headers['x-request-id']
                });

                next(error);
            }
        };
    }
}

export default DocumentRoutes.getInstance();