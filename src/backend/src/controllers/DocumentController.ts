// src/controllers/DocumentController.ts

import { Request, Response } from 'express';
import { Document, Classification } from '../types/document';
import { DocumentStorageService } from '../services/DocumentStorageService';
import { OPAService } from '../services/OPAService';
import { LoggerService } from '../services/LoggerService';

export class DocumentController {
    private static instance: DocumentController;
    private documentService: DocumentStorageService;
    private opaService: OPAService;
    private logger: LoggerService;

    private constructor() {
        this.documentService = DocumentStorageService.getInstance();
        this.opaService = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
    }

    public static getInstance(): DocumentController {
        if (!DocumentController.instance) {
            DocumentController.instance = new DocumentController();
        }
        return DocumentController.instance;
    }

    async uploadDocument(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file provided' });
                return;
            }

            const metadata = JSON.parse(req.body.metadata);
            const userInfo = req.userAttributes;

            if (!userInfo) {
                res.status(401).json({ error: 'User not authenticated' });
                return;
            }

            const accessResult = await this.opaService.evaluateAccess(
                userInfo,
                {
                    clearance: metadata.classification,
                    releasableTo: metadata.releasability,
                    coiTags: metadata.coiTags
                },
                'create'
            );

            if (!accessResult.allow) {
                this.logger.warn('Document creation denied', {
                    userId: userInfo.uniqueIdentifier,
                    classification: metadata.classification,
                    reason: accessResult.reason
                });
                res.status(403).json({
                    error: 'Access denied',
                    reason: accessResult.reason
                });
                return;
            }

            const document = await this.documentService.storeDocument(
                req.file.buffer,
                metadata,
                userInfo
            );

            res.status(201).json({
                message: 'Document uploaded successfully',
                documentId: document._id
            });

        } catch (error) {
            this.logger.error('Error uploading document', { 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
            res.status(500).json({ error: 'Failed to upload document' });
        }
    }

    async getDocument(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const userInfo = req.userAttributes;

            if (!userInfo) {
                res.status(401).json({ error: 'User not authenticated' });
                return;
            }

            const document = await this.documentService.retrieveDocument(documentId);

            if (!document) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            const accessResult = await this.opaService.evaluateAccess(
                userInfo,
                {
                    clearance: document.security.classification,
                    releasableTo: document.security.releasability,
                    coiTags: document.security.coiTags,
                    lacvCode: document.security.lacvCode
                },
                'read'
            );

            if (!accessResult.allow) {
                this.logger.warn('Document access denied', {
                    userId: userInfo.uniqueIdentifier,
                    documentId,
                    reason: accessResult.reason
                });
                res.status(403).json({
                    error: 'Access denied',
                    reason: accessResult.reason
                });
                return;
            }

            res.setHeader('Content-Type', document.content.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${document.metadata.originalFileName}"`);
            res.setHeader('Content-Length', document.content.size);
            res.send(document.content.data);

        } catch (error) {
            this.logger.error('Error retrieving document', { 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
            res.status(500).json({ error: 'Failed to retrieve document' });
        }
    }
}