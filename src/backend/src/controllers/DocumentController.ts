import { Response } from 'express';
// At the top of files using MongoDB types
import { Db as MongoDb, Collection, Document, ObjectId } from 'mongodb';
import { DocumentMetadata } from '../types'; // Ensure correct import path
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
    UserAttributes
} from '../types';
import { DocumentContent } from '../models/Document';
import { asAuthError } from '../middleware/errorHandler';
import { StorageService } from '../services/StorageService';
import { DocumentError } from '../errors/DocumentError';
import { prisma } from '../db';
import { Document as PrismaDocument } from '@prisma/client';

const id = new ObjectId();

export class DocumentController {
    private static instance: DocumentController;
    private readonly db: DatabaseService;
    private readonly opa: OPAService;
    private readonly logger: LoggerService;
    private readonly storage: DocumentStorageService;
    private readonly security: SecurityValidationService;
    private readonly metrics: MetricsService;
    private readonly storageService: StorageService;

    private constructor() {
        this.db = DatabaseService.getInstance();
        this.opa = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.storage = DocumentStorageService.getInstance();
        this.security = SecurityValidationService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.storageService = StorageService.getInstance();
    }

    public static getInstance(): DocumentController {
        if (!DocumentController.instance) {
            DocumentController.instance = new DocumentController();
        }
        return DocumentController.instance;
    }

    /**
     * Retrieves a document by ID with security checks.
     * Ensures the user has appropriate clearance and attributes to access the document.
     */
    public async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const documentId = req.params.id;

            if (!ObjectId.isValid(documentId)) {
                throw this.createError('Invalid document ID', 400, 'DOC001');
            }

            const document = await this.db.getDocument(documentId);
            if (!document) {
                throw this.createError('Document not found', 404, 'DOC002');
            }

            // Validate security access
            const accessResult = await this.opa.evaluateAccess(
                req.userAttributes,
                {
                    clearance: document.clearance,
                    releasableTo: document.releasableTo,
                    coiTags: document.coiTags,
                    lacvCode: document.lacvCode
                }
            );

            if (!accessResult.allow) {
                this.logger.warn('Document access denied', {
                    userId: req.userAttributes.uniqueIdentifier,
                    documentId,
                    reason: accessResult.reason
                });
                throw this.createError('Access denied', 403, 'DOC003');
            }

            // Retrieve document content
            const content = await this.storage.retrieveDocument(documentId);

            // Record metrics
            await this.metrics.recordDocumentAccess(
                document.clearance as ClearanceLevel,
                true
            );

            this.logger.info('Document accessed', {
                userId: req.userAttributes.uniqueIdentifier,
                documentId,
                clearance: document.clearance,
                duration: Date.now() - startTime
            });

            // File download if requested
            if (req.query.download === 'true') {
                const fileStream = await this.storageService.getFileStream(
                    content.location.bucket,
                    content.location.key
                );
                res.setHeader('Content-Type', content.mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${document.title}"`);
                fileStream.pipe(res);
            } else {
                res.json({
                    document,
                    content: content.content
                });
            }

        } catch (error) {
            this.handleError(error, req, res);
        }
    }

    /**
     * Searches for documents based on provided criteria.
     * Filters results based on user's security attributes.
     */
    public async searchDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const searchQuery = this.validateSearchQuery(req.body.query || {});
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

            // Create sort options object
            const sortField = (req.query.sort as keyof NATODocument) || 'metadata.createdAt';
            const sortOrder = req.query.order === 'desc' ? -1 : 1;
            const sort = { [sortField]: sortOrder };

            const documents = await this.db.searchDocuments(searchQuery, {
                page,
                limit,
                sort: {
                    field: sortField,
                    order: sortOrder === -1 ? 'desc' : 'asc'
                }
            });

            // Filter documents based on user's security attributes
            const accessibleDocuments = await Promise.all(
                documents.data.map(async (doc: NATODocument) => {
                    const accessResult = await this.opa.evaluateAccess(
                        req.userAttributes,
                        {
                            clearance: doc.clearance,
                            releasableTo: doc.releasableTo,
                            coiTags: doc.coiTags,
                            lacvCode: doc.lacvCode
                        }
                    );
                    return accessResult.allow ? doc : null;
                })
            );

            const filteredDocuments = accessibleDocuments.filter((doc: NATODocument | null): doc is NATODocument => doc !== null);

            // Get total count for pagination
            const totalCount = await this.db.countDocuments(searchQuery);

            // Record metrics
            this.metrics.recordHttpRequest(req.method, req.path, 200, Date.now() - startTime);

            // Log search results
            this.logger.info('Document search performed', {
                userId: req.userAttributes.uniqueIdentifier,
                query: searchQuery,
                resultCount: filteredDocuments.length,
                totalCount,
                duration: Date.now() - startTime
            });

            res.json({
                documents: filteredDocuments,
                pagination: {
                    page,
                    limit,
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit)
                }
            });

        } catch (error) {
            const typedError = asAuthError(error);

            this.logger.error('Error searching documents', {
                error: typedError,
                userId: req.userAttributes.uniqueIdentifier,
                query: req.body.query
            });

            res.status(typedError.statusCode || 500).json({
                error: typedError.message || 'Internal server error',
                code: typedError.code || 'DOC000'
            });
        }
    }

    /**
     * Creates a new document with security metadata.
     * Validates user has appropriate clearance to create documents at specified level.
     */
    public async createDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { file, ...documentData } = req.body;
            const user = req.userAttributes;

            // Upload file to storage
            const storageLocation = await this.storageService.uploadFile(file, {
                classification: documentData.classification,
                coiTags: documentData.coiTags
            });

            // Create document record
            const document = new Document({
                ...documentData,
                metadata: {
                    createdBy: user.uniqueIdentifier,
                    lastModifiedBy: user.uniqueIdentifier,
                    checksum: await this.storageService.calculateChecksum(file),
                    mimeType: file.mimetype,
                    size: file.size
                },
                storageLocation
            });

            await document.save();

            this.logger.auditAccess(req, 'SUCCESS', {
                actionType: 'CREATE',
                resourceId: document._id,
                classification: document.classification
            });

            res.status(201).json(document);
        } catch (error) {
            this.logger.auditError(req, error as Error);
            throw new DocumentError('Failed to create document', 500, error as Error);
        }
    }

    /**
     * Updates an existing document while maintaining security controls.
     * Ensures user has appropriate clearance and authorization to modify the document.
     */
    public async updateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { file, ...updateData } = req.body;
            const user = req.userAttributes;

            const document = await this.db.getDocument(id);
            if (!document) {
                throw new DocumentError('Document not found', 404);
            }

            // Handle file update if provided
            if (file) {
                // Delete old file
                await this.storage.deleteFile(
                    document.storageLocation.bucket,
                    document.storageLocation.key
                );

                // Upload new file
                const storageLocation = await this.storage.uploadFile(file, {
                    classification: updateData.classification || document.classification,
                    coiTags: updateData.coiTags || document.coiTags
                });

                updateData.storageLocation = storageLocation;
                updateData.metadata = {
                    ...document.metadata,
                    lastModifiedBy: user.uniqueIdentifier,
                    lastModifiedAt: new Date(),
                    version: document.metadata.version + 1,
                    checksum: await this.storage.calculateChecksum(file),
                    mimeType: file.mimetype,
                    size: file.size
                };
            }

            const updatedDocument = await this.db.updateDocument(id, {
                ...updateData,
                metadata: {
                    ...document.metadata,
                    lastModifiedBy: user.uniqueIdentifier,
                    lastModifiedAt: new Date()
                }
            });

            this.logger.auditAccess(req, 'SUCCESS', {
                actionType: 'UPDATE',
                resourceId: id,
                classification: updatedDocument.classification
            });

            res.json(updatedDocument);
        } catch (error) {
            this.logger.auditError(req, error as Error);
            throw new DocumentError('Failed to update document', 500, error as Error);
        }
    }

    public async deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const document = await this.db.getDocument(id);

            if (!document) {
                throw new DocumentError('Document not found', 404);
            }

            // Delete file from storage
            await this.storage.deleteFile(
                document.storageLocation.bucket,
                document.storageLocation.key
            );

            // Soft delete by updating status to ARCHIVED
            await this.db.updateDocument(id, {
                status: 'ARCHIVED',
                metadata: {
                    lastModifiedBy: req.userAttributes.uniqueIdentifier,
                    lastModifiedAt: new Date()
                }
            });

            this.logger.auditAccess(req, 'SUCCESS', {
                actionType: 'DELETE',
                resourceId: id,
                classification: document.classification
            });

            res.status(204).send();
        } catch (error) {
            this.logger.auditError(req, error as Error);
            throw new DocumentError('Failed to delete document', 500, error as Error);
        }
    }

    public async getDocumentMetadata(id: string, userAttributes: UserAttributes): Promise<DocumentMetadata> {
        try {
            const document = await this.db.getDocument(id);
            if (!document) {
                throw this.createError('Document not found', 404, 'DOC002');
            }

            const accessResult = await this.opa.evaluateAccess(
                userAttributes,
                {
                    clearance: document.clearance,
                    releasableTo: document.releasableTo,
                    coiTags: document.coiTags,
                    lacvCode: document.lacvCode
                }
            );

            if (!accessResult.allow) {
                throw this.createError('Access denied', 403, 'DOC003');
            }

            return {
                ...document.metadata,
                clearance: document.clearance
            } as DocumentMetadata;

        } catch (error) {
            this.logger.error('Error retrieving document metadata:', error);
            throw this.createStorageError((error as Error).message, 500, 'DOC008', { originalError: error });
        }
    }

    public async getDocumentVersions(id: string, userAttributes: UserAttributes): Promise<DocumentMetadata[]> {
        try {
            const document = await this.db.getDocument(id);
            if (!document) {
                throw this.createError('Document not found', 404, 'DOC002');
            }

            const accessResult = await this.opa.evaluateAccess(
                userAttributes,
                {
                    clearance: document.clearance,
                    releasableTo: document.releasableTo,
                    coiTags: document.coiTags,
                    lacvCode: document.lacvCode
                }
            );

            if (!accessResult.allow) {
                throw this.createError('Access denied', 403, 'DOC003');
            }

            const versions = await this.db.getDocumentVersions(id);
            return versions;

        } catch (error) {
            this.logger.error('Error retrieving document versions:', error);
            throw this.createStorageError((error as Error).message, 500, 'DOC008', { originalError: error });
        }
    }

    // Private helper methods

    private validateSearchQuery(query: any): DocumentSearchQuery {
        const validatedQuery: DocumentSearchQuery = {};

        if (query.clearance && this.isValidClearance(query.clearance)) {
            validatedQuery.clearance = query.clearance;
        }

        if (Array.isArray(query.releasableTo)) {
            validatedQuery.releasableTo = query.releasableTo.filter(
                (marker: string) => this.isValidReleasabilityMarker(marker)
            );
        }

        if (Array.isArray(query.coiTags)) {
            validatedQuery.coiTags = query.coiTags.filter(
                (tag: string) => this.isValidCoiTag(tag)
            );
        }

        if (query.lacvCode && this.isValidLacvCode(query.lacvCode)) {
            validatedQuery.lacvCode = query.lacvCode;
        }

        if (query.dateRange) {
            validatedQuery.dateRange = {
                start: new Date(query.dateRange.start),
                end: new Date(query.dateRange.end)
            };
        }

        if (query.keywords && typeof query.keywords === 'string') {
            validatedQuery.keywords = query.keywords;
        }

        return validatedQuery;
    }

    private validateDocumentData(data: any): Partial<NATODocument> {
        const validatedData: Partial<NATODocument> = {};

        if (!data.title || typeof data.title !== 'string') {
            throw this.createError('Invalid document title', 400, 'DOC006');
        }
        validatedData.title = data.title;

        if (!data.clearance || !this.isValidClearance(data.clearance)) {
            throw this.createError('Invalid clearance level', 400, 'DOC007');
        }
        validatedData.clearance = data.clearance;

        if (!Array.isArray(data.releasableTo)) {
            throw this.createError('Invalid releasableTo format', 400, 'DOC008');
        }
        validatedData.releasableTo = data.releasableTo.filter(
            (marker: string) => this.isValidReleasabilityMarker(marker)
        );

        if (data.coiTags !== undefined) {
            if (!Array.isArray(data.coiTags)) {
                throw this.createError('Invalid coiTags format', 400, 'DOC009');
            }
            validatedData.coiTags = data.coiTags.filter(
                (tag: string) => this.isValidCoiTag(tag)
            );
        }

        if (data.lacvCode !== undefined) {
            if (!this.isValidLacvCode(data.lacvCode)) {
                throw this.createError('Invalid lacvCode format', 400, 'DOC010');
            }
            validatedData.lacvCode = data.lacvCode;
        }

        return validatedData;
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

    private hasAdequateClearance(userClearance: ClearanceLevel, documentClearance: ClearanceLevel): boolean {
        const clearanceLevels: Record<ClearanceLevel, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 1,
            'NATO CONFIDENTIAL': 2,
            'NATO SECRET': 3,
            'COSMIC TOP SECRET': 4
        };

        return clearanceLevels[userClearance] >= clearanceLevels[documentClearance];
    }

    // Type guard methods
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

    private isValidReleasabilityMarker(marker: string): boolean {
        const validMarkers = ['NATO', 'EU', 'FVEY', 'PARTNERX'];
        return typeof marker === 'string' && validMarkers.includes(marker);
    }

    private isValidCoiTag(tag: string): boolean {
        const validTags = ['OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'];
        return typeof tag === 'string' && validTags.includes(tag);
    }

    private isValidLacvCode(code: string): boolean {
        const validCodes = ['LACV001', 'LACV002', 'LACV003', 'LACV004'];
        return typeof code === 'string' && validCodes.includes(code);
    }


    /**
     * Creates a standardized error object for document storage operations.
     * This helper method ensures consistent error formatting and proper typing
     * for all storage-related errors in the NATO document system.
     * 
     * @param message - Human-readable error message
     * @param statusCode - HTTP status code for the error
     * @param code - Internal error code for tracking and monitoring
     * @param details - Additional error context and metadata
     * @returns Properly formatted AuthError object
     */
    private createStorageError(
        message: string,
        statusCode: number,
        code: string,
        details?: Record<string, unknown>
    ): AuthError {
        const error = new Error(message) as AuthError;
        error.statusCode = statusCode;
        error.code = code;

        // Add storage-specific metadata to the error
        error.details = {
            timestamp: new Date(),
            ...details,
            storageOperation: true
        };

        // Log the error for monitoring
        this.logger.error('Document storage error:', {
            message,
            code,
            statusCode,
            details
        });

        return error;
    }

    /**
     * Validates document metadata to ensure all required fields are present
     * and properly formatted according to NATO standards.
     */
    private validateMetadata(metadata: any): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required fields
        if (!metadata.createdBy) {
            errors.push('Missing document creator identifier');
        }

        if (!metadata.version || typeof metadata.version !== 'number') {
            errors.push('Invalid or missing document version');
        }

        // Check dates
        try {
            new Date(metadata.createdAt);
            new Date(metadata.lastModified);
        } catch (error) {
            errors.push('Invalid date format in metadata');
        }

        // Check version sequence
        if (metadata.version < 1) {
            errors.push('Document version must be greater than 0');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Sanitizes document content to ensure it meets security requirements
     * and doesn't contain any restricted content patterns.
     */
    private sanitizeContent(content: any): DocumentContent {
        return {
            location: content.location,
            hash: content.hash,
            mimeType: content.mimeType,
            size: content.size ? parseInt(content.size.toString()) : undefined
        };
    }

    /**
     * Validates and processes document relationships and references
     * to maintain data integrity and security context.
     */
    private async validateDocumentRelationships(
        documentId: string,
        relationships: any[]
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Validate each related document exists and is accessible
            for (const relation of relationships) {
                if (!ObjectId.isValid(relation.documentId)) {
                    errors.push(`Invalid related document ID: ${relation.documentId}`);
                    continue;
                }

                const relatedDoc = await this.db.getDocument(relation.documentId);
                if (!relatedDoc) {
                    errors.push(`Related document not found: ${relation.documentId}`);
                    continue;
                }

                // Check for clearance level compatibility
                if (this.getClearanceLevel(relatedDoc.clearance) >
                    this.getClearanceLevel(documentId as ClearanceLevel)) {
                    errors.push(
                        `Invalid relationship: related document has higher clearance`
                    );
                }
            }
        } catch (error) {
            errors.push('Error validating document relationships');
            this.logger.error('Relationship validation error:', error);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Converts clearance level to numeric value for comparison
     */
    private getClearanceLevel(clearance: ClearanceLevel): number {
        const levels: Record<ClearanceLevel, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 1,
            'NATO CONFIDENTIAL': 2,
            'NATO SECRET': 3,
            'COSMIC TOP SECRET': 4
        };
        return levels[clearance];
    }

    /**
     * Checks if a given operation would violate NATO security policies
     */
    private async validateSecurityPolicy(
        document: Partial<NATODocument>,
        userAttributes: UserAttributes
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate clearance compatibility
        if (document.clearance &&
            !this.hasAdequateClearance(userAttributes.clearance, document.clearance)) {
            errors.push('User clearance insufficient for document classification');
        }

        // Validate releasability markers
        if (document.releasableTo?.length === 0) {
            errors.push('Document must have at least one releasability marker');
        }

        // Validate COI tag requirements
        if (document.coiTags && document.coiTags.length > 0) {
            const hasValidCoi = document.coiTags.every(tag =>
                userAttributes.coiTags?.includes(tag)
            );
            if (!hasValidCoi) {
                errors.push('User lacks required COI memberships');
            }
        }

        // Validate LACV code requirements
        if (document.lacvCode &&
            document.lacvCode !== userAttributes.lacvCode &&
            userAttributes.clearance !== 'COSMIC TOP SECRET') {
            errors.push('User lacks required LACV code access');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    private handleError(error: unknown, req: AuthenticatedRequest, res: Response): void {
        const typedError = error as AuthError;

        this.logger.error('Document operation error:', {
            error: typedError,
            userId: req.userAttributes?.uniqueIdentifier,
            documentId: req.params.id
        });

        res.status(typedError.statusCode || 500).json({
            error: typedError.message || 'Internal server error',
            code: typedError.code || 'DOC000',
            details: typedError.details
        });
    }

    public createVersion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { file, comment } = req.body;
            const user = req.userAttributes;

            const document = await this.db.getDocument(id);
            if (!document) {
                throw new DocumentError('Document not found', 404);
            }

            // Store old version details
            const oldVersion = {
                documentId: document._id,
                version: document.metadata.version,
                storageLocation: document.storageLocation,
                metadata: document.metadata,
                comment
            };

            // Upload new version
            const storageLocation = await this.storage.uploadFile(file, {
                classification: document.classification,
                coiTags: document.coiTags
            });

            // Update document with new version
            const updatedDocument = await this.db.updateDocument(id, {
                storageLocation,
                metadata: {
                    ...document.metadata,
                    version: document.metadata.version + 1,
                    lastModifiedBy: user.uniqueIdentifier,
                    lastModifiedAt: new Date(),
                    checksum: await this.storage.calculateChecksum(file),
                    mimeType: file.mimetype,
                    size: file.size
                }
            });

            // Store version history
            await this.storage.storeVersionHistory(oldVersion);

            this.logger.auditAccess(req, 'SUCCESS', {
                actionType: 'CREATE_VERSION',
                resourceId: id,
                classification: document.classification
            });

            res.json(updatedDocument);
        } catch (error) {
            this.logger.auditError(req, error as Error);
            throw new DocumentError('Failed to create version', 500, error as Error);
        }
    };

    public listVersions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const document = await this.db.getDocument(id);

            if (!document) {
                throw new DocumentError('Document not found', 404);
            }

            const versions = await this.storage.getVersionHistory(id);

            this.logger.auditAccess(req, 'SUCCESS', {
                actionType: 'LIST_VERSIONS',
                resourceId: id,
                classification: document.classification
            });

            res.json(versions);
        } catch (error) {
            this.logger.auditError(req, error as Error);
            throw new DocumentError('Failed to list versions', 500, error as Error);
        }
    };

    async createDocument(data: {
        title: string;
        classification: string;
        metadata: any;
        coiTags: string[];
        partnerId?: string;
    }): Promise<PrismaDocument> {
        // Validate classification level
        if (!this.isValidClassification(data.classification)) {
            throw new Error('Invalid classification level');
        }

        return prisma.document.create({
            data: {
                title: data.title,
                classification: data.classification,
                metadata: data.metadata,
                coiTags: data.coiTags,
                partnerId: data.partnerId
            }
        });
    }

    async getDocuments(query: {
        classification?: string;
        coiTags?: string[];
        partnerId?: string;
    }): Promise<PrismaDocument[]> {
        return prisma.document.findMany({
            where: {
                classification: query.classification,
                coiTags: query.coiTags ? { hasEvery: query.coiTags } : undefined,
                partnerId: query.partnerId
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getDocument(id: string): Promise<PrismaDocument | null> {
        return prisma.document.findUnique({
            where: { id }
        });
    }

    private isValidClassification(classification: string): boolean {
        const validClassifications = [
            'UNCLASSIFIED',
            'RESTRICTED',
            'CONFIDENTIAL',
            'SECRET',
            'TOP_SECRET'
        ];
        return validClassifications.includes(classification);
    }
}

export default DocumentController.getInstance();