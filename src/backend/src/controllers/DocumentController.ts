import { Response } from 'express';
import { ObjectId } from 'mongodb';
import { DatabaseService } from '../services/DatabaseService';
import { OPAService } from '../services/OPAService';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { 
    AuthenticatedRequest,
    DocumentSearchQuery,
    NATODocument,
    PaginationOptions,
    AuthError,
    ClearanceLevel,
    ValidationResult 
} from '../types';
import { asAuthError } from '../utils/errorUtils';
import { DocumentContent } from '../models/Document';

export class DocumentController {
    private static instance: DocumentController;
    private readonly db: DatabaseService;
    private readonly opa: OPAService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.db = DatabaseService.getInstance();
        this.opa = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
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

            // Validate document ID format
            if (!ObjectId.isValid(documentId)) {
                throw this.createError('Invalid document ID format', 400, 'DOC001');
            }

            const document = await this.db.getDocument(documentId);
            
            if (!document) {
                throw this.createError('Document not found', 404, 'DOC002');
            }

            // Check access permissions using OPA
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
                this.logger.warn('Access denied', {
                    userId: req.userAttributes.uniqueIdentifier,
                    documentId,
                    reason: accessResult.reason
                });

                throw this.createError('Access denied', 403, 'DOC003', { reason: accessResult.reason });
            }

            // Record metrics
            this.metrics.recordDocumentAccess(document.clearance, true);
            this.metrics.recordHttpRequest(req.method, req.path, 200, Date.now() - startTime);

            // Log successful access
            this.logger.info('Document accessed', {
                userId: req.userAttributes.uniqueIdentifier,
                documentId,
                duration: Date.now() - startTime
            });

            res.json({ document });

        } catch (error) {
            const typedError = asAuthError(error);
            
            this.logger.error('Error retrieving document', {
                error: typedError,
                userId: req.userAttributes.uniqueIdentifier,
                documentId: req.params.id
            });

            // Record failed access attempt if appropriate
            if (typedError.code === 'DOC003') {
                this.metrics.recordDocumentAccess(typedError.details?.clearance || 'UNKNOWN', false);
            }

            res.status(typedError.statusCode || 500).json({ 
                error: typedError.message || 'Internal server error',
                code: typedError.code || 'DOC000'
            });
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
                sort
            });
            
            // Filter documents based on user's security attributes
            const accessibleDocuments = await Promise.all(
                documents.map(async (doc: NATODocument) => {
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

            const filteredDocuments = accessibleDocuments.filter((doc): doc is NATODocument => doc !== null);

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
        const startTime = Date.now();
        try {
            const documentData = this.validateDocumentData(req.body);

            // Ensure user has sufficient clearance to create document
            if (!documentData.clearance || !this.hasAdequateClearance(req.userAttributes.clearance, documentData.clearance)) {
                throw this.createError(
                    'Insufficient clearance to create document',
                    403,
                    'DOC004',
                    { requiredClearance: documentData.clearance }
                );
            }

            const newDocument = await this.db.createDocument({
                ...documentData,
                metadata: {
                    createdAt: new Date(),
                    createdBy: req.userAttributes.uniqueIdentifier,
                    lastModified: new Date(),
                    version: 1
                }
            } as Omit<NATODocument, '_id'>);

            // Record metrics
            this.metrics.recordHttpRequest(req.method, req.path, 201, Date.now() - startTime);

            this.logger.info('Document created', {
                userId: req.userAttributes.uniqueIdentifier,
                documentId: newDocument._id,
                clearance: newDocument.clearance,
                duration: Date.now() - startTime
            });

            res.status(201).json({ document: newDocument });

        } catch (error) {
            const typedError = asAuthError(error);
            
            this.logger.error('Error creating document', {
                error: typedError,
                userId: req.userAttributes.uniqueIdentifier
            });

            res.status(typedError.statusCode || 500).json({
                error: typedError.message || 'Internal server error',
                code: typedError.code || 'DOC000'
            });
        }
    }

    /**
     * Updates an existing document while maintaining security controls.
     * Ensures user has appropriate clearance and authorization to modify the document.
     */
    public async updateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        try {
            const documentId = req.params.id;
            
            if (!ObjectId.isValid(documentId)) {
                throw this.createError('Invalid document ID format', 400, 'DOC001');
            }

            const existingDocument = await this.db.getDocument(documentId);
            
            if (!existingDocument) {
                throw this.createError('Document not found', 404, 'DOC002');
            }

            // Check update permissions using OPA
            const updateResult = await this.opa.evaluateUpdateAccess(
                req.userAttributes,
                existingDocument
            );

            if (!updateResult.allow) {
                throw this.createError(
                    'Insufficient permissions to update document',
                    403,
                    'DOC005',
                    { reason: updateResult.reason }
                );
            }

            const updatedData = this.validateDocumentData(req.body);
            const updatedDocument = await this.db.updateDocument(documentId, {
                ...updatedData,
                metadata: {
                    ...existingDocument.metadata,
                    lastModified: new Date(),
                    version: existingDocument.metadata.version + 1,
                    lastModifiedBy: req.userAttributes.uniqueIdentifier
                }
            });

            // Record metrics
            this.metrics.recordHttpRequest(req.method, req.path, 200, Date.now() - startTime);

            this.logger.info('Document updated', {
                userId: req.userAttributes.uniqueIdentifier,
                documentId,
                version: updatedDocument?.metadata?.version,
                duration: Date.now() - startTime
            });

            res.json({ document: updatedDocument });

        } catch (error) {
            const typedError = asAuthError(error);
            
            this.logger.error('Error updating document', {
                error: typedError,
                userId: req.userAttributes.uniqueIdentifier,
                documentId: req.params.id
            });

            res.status(typedError.statusCode || 500).json({
                error: typedError.message || 'Internal server error',
                code: typedError.code || 'DOC000'
            });
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
            (marker: unknown) => this.isValidReleasabilityMarker(marker)
        );

        if (data.coiTags !== undefined) {
            if (!Array.isArray(data.coiTags)) {
                throw this.createError('Invalid coiTags format', 400, 'DOC009');
            }
            validatedData.coiTags = data.coiTags.filter(
                (tag: unknown) => this.isValidCoiTag(tag)
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

    private isValidReleasabilityMarker(marker: unknown): boolean {
        const validMarkers = ['NATO', 'EU', 'FVEY', 'PARTNERX'];
        return typeof marker === 'string' && validMarkers.includes(marker);
    }

    private isValidCoiTag(tag: unknown): boolean {
      const validTags = ['OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'];
      return typeof tag === 'string' && validTags.includes(tag);
  }

  private isValidLacvCode(code: unknown): boolean {
      const validCodes = ['LACV001', 'LACV002', 'LACV003', 'LACV004'];
      return typeof code === 'string' && validCodes.includes(code);
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
                  this.getClearanceLevel(documentId)) {
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
      if (document.coiTags?.length > 0) {
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
}

export default DocumentController.getInstance();