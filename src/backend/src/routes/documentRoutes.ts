// src/routes/documentRoutes.ts
import { Router } from 'express';
import AuthMiddleware from '../middleware/auth';
import DocumentAccessMiddleware from '../middleware/documentAccess';
import DocumentValidationMiddleware from '../middleware/documentValidation';
import { DocumentController } from '../controllers/DocumentController';
import { wrapAsync } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';

export class DocumentRoutes {
    private static instance: DocumentRoutes;
    private readonly router: Router;
    private readonly documentController: DocumentController;
    private readonly authMiddleware: typeof AuthMiddleware;
    private readonly accessMiddleware: typeof DocumentAccessMiddleware;
    private readonly validationMiddleware: typeof DocumentValidationMiddleware;

    private constructor() {
        this.router = Router();
        this.documentController = DocumentController.getInstance();
        this.authMiddleware = AuthMiddleware;
        this.accessMiddleware = DocumentAccessMiddleware;
        this.validationMiddleware = DocumentValidationMiddleware;
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
        // Apply authentication to all routes
        this.router.use(this.authMiddleware.authenticate);

        // Search documents
        this.router.post('/search', wrapAsync(
            async (req: AuthenticatedRequest, res) => 
                this.documentController.searchDocuments(req, res)
        ));

        // Get single document
        this.router.get('/:id',
            wrapAsync(
                async (req: AuthenticatedRequest, res, next) => {
                    const document = await this.documentController.getDocument(req, res);
                    res.locals.document = document;
                    next();
                }
            ),
            this.accessMiddleware.validateAccess,
            wrapAsync(
                async (req: AuthenticatedRequest, res) => {
                    res.json({ document: res.locals.document });
                }
            )
        );

        // Create document
        this.router.post('/',
            this.authMiddleware.requireClearance('NATO CONFIDENTIAL'),
            this.validationMiddleware.validateDocument,
            wrapAsync(
                async (req: AuthenticatedRequest, res) => 
                    this.documentController.createDocument(req, res)
            )
        );

        // Update document
        this.router.put('/:id',
            this.authMiddleware.requireClearance('NATO CONFIDENTIAL'),
            wrapAsync(
                async (req: AuthenticatedRequest, res, next) => {
                    const document = await this.documentController.getDocument(req, res);
                    res.locals.document = document;
                    next();
                }
            ),
            this.accessMiddleware.validateAccess,
            this.validationMiddleware.validateDocument,
            wrapAsync(
                async (req: AuthenticatedRequest, res) => 
                    this.documentController.updateDocument(req, res)
            )
        );

        // Delete document
        this.router.delete('/:id',
            this.authMiddleware.requireClearance('NATO SECRET'),
            wrapAsync(
                async (req: AuthenticatedRequest, res, next) => {
                    const document = await this.documentController.getDocument(req, res);
                    res.locals.document = document;
                    next();
                }
            ),
            this.accessMiddleware.validateAccess,
            wrapAsync(
                async (req: AuthenticatedRequest, res) => 
                    this.documentController.deleteDocument(req, res)
            )
        );

        // Get document metadata
        this.router.get('/:id/metadata',
            wrapAsync(
                async (req: AuthenticatedRequest, res, next) => {
                    const document = await this.documentController.getDocument(req, res);
                    res.locals.document = document;
                    next();
                }
            ),
            this.accessMiddleware.validateAccess,
            wrapAsync(
                async (req: AuthenticatedRequest, res) => 
                    this.documentController.getDocumentMetadata(req, res)
            )
        );
    }
}

// Helper to wrap async functions for proper error handling
const wrapAsync = (fn: Function) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            next(error);
        }
    };
};

export default DocumentRoutes.getInstance();