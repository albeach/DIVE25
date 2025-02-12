// src/backend/src/middleware/documentAccess.ts

import { Request, Response, NextFunction } from 'express';
import { OPAService } from '../services/OPAService';
import { DocumentStorageService } from '../services/DocumentStorageService';
import { LoggerService } from '../services/LoggerService';

export async function documentAccessMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const logger = LoggerService.getInstance();
    const opaService = OPAService.getInstance();
    const documentService = DocumentStorageService.getInstance();

    try {
        // Extract the document ID from the request
        const documentId = req.params.id || req.body.documentId;
        
        if (!documentId) {
            next();
            return;
        }

        // Get document from storage
        const document = await documentService.retrieveDocument(documentId);
        
        if (!document) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        // Determine the action being performed
        let action = 'read';
        if (req.method === 'POST') action = 'create';
        if (req.method === 'PUT') action = 'update';
        if (req.method === 'DELETE') action = 'delete';

        // Get user attributes from PingFederate token
        const userAttributes = req.userAttributes;

        // Evaluate access using our NATO ABAC policy
        const accessResult = await opaService.evaluateDocumentAccess(
            userAttributes,
            document,
            action
        );

        if (!accessResult.allow) {
            logger.warn('Document access denied', {
                userId: userAttributes.uniqueIdentifier,
                documentId: documentId,
                action: action,
                reason: accessResult.reason
            });

            res.status(403).json({
                error: 'Access denied',
                reason: accessResult.reason
            });
            return;
        }

        // Attach document to request for downstream handlers
        req.document = document;
        next();

    } catch (error) {
        logger.error('Error in document access middleware', { error });
        res.status(500).json({ error: 'Internal server error' });
    }
}