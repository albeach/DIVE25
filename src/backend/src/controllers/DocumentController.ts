import { Response } from 'express';
import { Db, Collection, Document, ObjectId } from 'mongodb';
import { DocumentMetadata } from '../types';
import { DatabaseService } from '../services/DatabaseService';
import { OPAService } from '../services/OPAService';
import { LoggerService } from '../services/LoggerService';
import { DocumentStorageService } from '../services/DocumentStorageService';
import { SecurityValidationService } from '../services/SecurityValidationService';
import { MetricsService } from '../services/MetricsService';
import {
    AuthenticatedRequest,
    DocumentSearchQuery,
    NATODocument,
    PaginationOptions,
    AuthError,
    ClearanceLevel,
    ValidationResult,
    UserAttributes,
    SearchResult
} from '../types';
import { SECURITY_CONSTANTS } from '../constants/security';

export class DocumentController {
    private static instance: DocumentController;
    private readonly db: DatabaseService;
    private readonly opa: OPAService;
    private readonly logger: LoggerService;
    private readonly storage: DocumentStorageService;
    private readonly security: SecurityValidationService;
    private readonly metrics: MetricsService;
    private collection: Collection<NATODocument>;

    private constructor() {
        this.db = DatabaseService.getInstance();
        this.opa = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.storage = DocumentStorageService.getInstance();
        this.security = SecurityValidationService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): DocumentController {
        if (!DocumentController.instance) {
            DocumentController.instance = new DocumentController();
        }
        return DocumentController.instance;
    }

    public async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const document = await this.storage.getDocument(req.params.id);

            if (!document) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }

            const accessResult = await this.opa.evaluateAccess(
                req.userAttributes,
                {
                    path: req.path,
                    method: req.method,
                    classification: document.classification,
                    releasableTo: document.releasableTo,
                    coiTags: document.coiTags,
                    lacvCode: document.lacvCode
                }
            );

            if (!accessResult.allow) {
                res.status(403).json({ error: accessResult.reason || 'Access denied' });
                return;
            }

            res.json(document);
        } catch (error) {
            this.logger.error('Error retrieving document:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    public async searchDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const query: DocumentSearchQuery = {
                title: req.query.title as string,
                classification: req.query.classification as ClearanceLevel,
                coiTags: req.query.coiTags as string[],
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 10
            };

            const results: SearchResult<NATODocument> = await this.storage.searchDocuments(
                query,
                req.userAttributes
            );

            res.json(results);
        } catch (error) {
            this.logger.error('Error searching documents:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    public async createDocument(
        documentData: Partial<NATODocument>,
        userAttributes: UserAttributes
    ): Promise<NATODocument> {
        try {
            if (!documentData.clearance || !this.hasAdequateClearance(userAttributes.clearance, documentData.clearance)) {
                throw this.createError(
                    'Insufficient clearance to create document',
                    403,
                    'DOC004',
                    { requiredClearance: documentData.clearance }
                );
            }

            const document = await this.db.createDocument({
                ...documentData,
                metadata: {
                    createdAt: new Date(),
                    createdBy: userAttributes.uniqueIdentifier,
                    lastModified: new Date(),
                    version: 1
                }
            } as Omit<NATODocument, '_id'>);

            this.logger.info('Document created', {
                documentId: document._id,
                createdBy: userAttributes.uniqueIdentifier
            });

            return document;

        } catch (error) {
            this.logger.error('Error creating document:', error);
            throw this.createError(
                'Failed to create document',
                500,
                'DOC005',
                { originalError: error }
            );
        }
    }

    public async updateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const existingDocument = await this.db.getDocument(documentId);

            if (!existingDocument) {
                throw this.createError('Document not found', 404, 'DOC002');
            }

            const modificationResult = await this.security.validateSecurityModification(
                existingDocument,
                req.body,
                req.userAttributes
            );

            if (!modificationResult.valid) {
                throw this.createError(
                    'Invalid security modifications',
                    400,
                    'DOC006',
                    { errors: modificationResult.errors }
                );
            }

            const updatedDocument = await this.db.updateDocument(documentId, {
                ...req.body,
                metadata: {
                    ...existingDocument.metadata,
                    lastModified: new Date(),
                    version: existingDocument.metadata.version + 1,
                    lastModifiedBy: req.userAttributes.uniqueIdentifier
                }
            });

            res.json({
                success: true,
                data: updatedDocument,
                metadata: {
                    timestamp: new Date(),
                    requestId: req.headers['x-request-id']
                }
            });

        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    public async deleteDocument(id: string, userAttributes: UserAttributes): Promise<boolean> {
        try {
            const document = await this.db.getDocument(id);
            if (!document) {
                return false;
            }

            const deleteResult = await this.opa.evaluateUpdateAccess(
                userAttributes,
                document
            );

            if (!deleteResult.allow) {
                throw this.createError(
                    'Insufficient permissions to delete document',
                    403,
                    'DOC005',
                    { reason: deleteResult.reason }
                );
            }

            return await this.db.deleteDocument(id);

        } catch (error) {
            this.logger.error('Error deleting document:', error);
            throw this.createStorageError(error.message, 500, 'DOC008', { originalError: error });
        }
    }

    private validateSearchQuery(query: DocumentSearchQuery): DocumentSearchQuery {
        const validatedQuery: DocumentSearchQuery = {};

        if (query.clearance && this.isValidClearance(query.clearance)) {
            validatedQuery.clearance = query.clearance;
        }

        if (Array.isArray(query.releasableTo)) {
            validatedQuery.releasableTo = query.releasableTo;
        }

        if (Array.isArray(query.coiTags)) {
            validatedQuery.coiTags = query.coiTags;
        }

        if (query.dateRange) {
            validatedQuery.dateRange = {
                start: new Date(query.dateRange.start),
                end: new Date(query.dateRange.end)
            };
        }

        return validatedQuery;
    }

    private async validateUserAttributes(attributes: UserAttributes): Promise<void> {
        const validation = await this.opa.validateAttributes(attributes);

        if (!validation.valid) {
            throw this.createError(
                'Invalid user security attributes',
                401,
                'DOC007',
                { missingAttributes: validation.missingAttributes }
            );
        }
    }

    private hasAdequateClearance(userClearance: string, documentClearance: string): boolean {
        const clearanceLevels: { [key: string]: number } = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 1,
            'NATO CONFIDENTIAL': 2,
            'NATO SECRET': 3,
            'COSMIC TOP SECRET': 4
        };

        return clearanceLevels[userClearance] >= clearanceLevels[documentClearance];
    }

    private isValidClearance(clearance: unknown): clearance is ClearanceLevel {
        const validClearances: ClearanceLevel[] = [
            'UNCLASSIFIED',
            'RESTRICTED',
            'NATO CONFIDENTIAL',
            'NATO SECRET',
            'COSMIC TOP SECRET'
        ];
        return typeof clearance === 'string' && validClearances.includes(clearance as ClearanceLevel);
    }

    private createError(
        message: string,
        statusCode: number,
        code: string,
        details?: Record<string, unknown>
    ): AuthError {
        const error = new Error(message) as AuthError;
        error.statusCode = statusCode;
        error.code = code;
        if (details) {
            error.details = details;
        }
        return error;
    }

    private createStorageError(
        message: string,
        statusCode: number,
        code: string,
        details?: Record<string, unknown>
    ): AuthError {
        const error = new Error(message) as AuthError;
        error.statusCode = statusCode;
        error.code = code;
        error.details = {
            timestamp: new Date(),
            ...details
        };
        return error;
    }

    private handleError(error: unknown, req: AuthenticatedRequest, res: Response): void {
        const typedError = error as AuthError;

        this.logger.error('Document operation error:', {
            error: typedError,
            userId: req.userAttributes?.uniqueIdentifier,
            documentId: req.params.id
        });

        res.status(typedError.statusCode || 500).json({
            success: false,
            error: {
                message: typedError.message || 'Internal server error',
                code: typedError.code || 'DOC000',
                details: typedError.details
            },
            metadata: {
                timestamp: new Date(),
                requestId: req.headers['x-request-id']
            }
        });
    }
}

export default DocumentController.getInstance();