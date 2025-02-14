import { Router, Response, NextFunction } from 'express';
import AuthMiddleware from '../middleware/AuthMiddleware';
import DocumentAccessMiddleware from '../middleware/DocumentAccess';
import DocumentValidationMiddleware from '../middleware/DocumentValidation';
import { DocumentController } from '../controllers/DocumentController';
import { 
    AuthenticatedRequest,
    ApiResponse,
    NATODocument,
} from '../types';

export class DocumentRoutes {
    private static instance: DocumentRoutes;
    private readonly router: Router;
    private readonly documentController: DocumentController;

    private constructor() {
        this.router = Router();
        this.documentController = DocumentController.getInstance();
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

    private initializeRoutes(): void {
        this.router.use(AuthMiddleware.authenticate);
        this.router.use(AuthMiddleware.extractUserAttributes);

        this.router.get('/:id', 
            DocumentAccessMiddleware.validateAccess,
            this.handleGetDocument.bind(this)
        );

        this.router.post('/search',
            this.handleSearchDocuments.bind(this)
        );

        this.router.post('/',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL'),
            DocumentValidationMiddleware.validateDocument,
            this.handleCreateDocument.bind(this)
        );

        this.router.put('/:id',
            AuthMiddleware.requireClearance('NATO CONFIDENTIAL'),
            DocumentAccessMiddleware.validateAccess,
            DocumentValidationMiddleware.validateDocument,
            this.handleUpdateDocument.bind(this)
        );

        this.router.delete('/:id',
            AuthMiddleware.requireClearance('NATO SECRET'),
            DocumentAccessMiddleware.validateAccess,
            this.handleDeleteDocument.bind(this)
        );
    }

    private async handleGetDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        await this.documentController.getDocument(req, res);
    }

    private async handleSearchDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
        await this.documentController.searchDocuments(req, res);
    }

    private async handleCreateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const document = await this.documentController.createDocument(req.body, req.userAttributes);
        res.status(201).json({
            success: true,
            data: document
        });
    }

    private async handleUpdateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        await this.documentController.updateDocument(req, res);
    }

    private async handleDeleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const deleted = await this.documentController.deleteDocument(req.params.id, req.userAttributes);
            const status = deleted ? 200 : 404;
            res.status(status).json({
                success: deleted,
                message: deleted ? 'Document deleted successfully' : 'Document not found'
            });
        } catch (error) {
            const typedError = error instanceof Error ? error : new Error('Unknown error');
            const statusCode = (typedError as any).statusCode || 500;
            
            res.status(statusCode).json({
                success: false,
                message: 'Error deleting document',
                error: typedError.message
            });
        }
    }
}

export default DocumentRoutes.getInstance();