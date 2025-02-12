// src/backend/src/routes/documentRoutes.ts

import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from '../controllers/DocumentController';
import { authMiddleware } from '../middleware/auth';
import { validateDocumentMetadata } from '../middleware/documentValidation';
import { documentAccessMiddleware } from '../middleware/documentAccess';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const documentController = DocumentController.getInstance();

// Apply authentication and document access middleware to all routes
router.use(authMiddleware);
router.use(documentAccessMiddleware);

router.post(
    '/upload',
    upload.single('document'),
    validateDocumentMetadata,
    (req, res) => documentController.uploadDocument(req, res)
);

router.get(
    '/:id',
    (req, res) => documentController.getDocument(req, res)
);

router.post(
    '/search',
    (req, res) => documentController.searchDocuments(req, res)
);

router.get(
    '/:id/metadata',
    (req, res) => documentController.getDocumentMetadata(req, res)
);

export default router;