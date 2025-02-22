// src/middleware/DocumentAccessMiddleware.ts
import { Response, NextFunction } from 'express';
import { OPAService } from '../services/OPAService';
import { DocumentStorageService } from '../services/DocumentStorageService';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import {
    AuthenticatedRequest,
    AuthError,
    NATODocument,
    UserAttributes,
    ValidationResult,
    ClearanceLevel
} from '../types';
import { asAuthError } from './errorHandler';
import { SECURITY_CONSTANTS } from '../constants/security';

/**
 * Middleware responsible for enforcing NATO security policies and access controls
 * on document operations. This class implements attribute-based access control (ABAC)
 * using Open Policy Agent (OPA) for policy decisions. It serves as the primary 
 * security boundary for all document operations in the system.
 */
export class DocumentAccessMiddleware {
    private static instance: DocumentAccessMiddleware;
    private readonly opaService: OPAService;
    private readonly documentService: DocumentStorageService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    // Security constants
    private readonly SECURITY_CONFIG = {
        MAX_CLASSIFICATION_CHANGE_WINDOW: 300, // 5 minutes
        SUSPICIOUS_ACCESS_THRESHOLD: 3,
        MONITORING_WINDOW: 3600, // 1 hour
        REQUIRED_SECURITY_HEADERS: [
            'x-request-id',
            'x-correlation-id',
            'x-user-clearance'
        ]
    };

    private constructor() {
        this.opaService = OPAService.getInstance();
        this.documentService = DocumentStorageService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): DocumentAccessMiddleware {
        if (!DocumentAccessMiddleware.instance) {
            DocumentAccessMiddleware.instance = new DocumentAccessMiddleware();
        }
        return DocumentAccessMiddleware.instance;
    }

    /**
     * Main access control middleware that validates document access based on 
     * user attributes and document security metadata. This method implements
     * NATO security policies through OPA evaluation.
     */
    public validateAccess = async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const startTime = Date.now();
        const requestId = req.headers['x-request-id'] as string;

        try {
            this.validateSecurityHeaders(req);

            const documentId = req.params.id || req.body.documentId;
            const action = this.determineRequestedAction(req);

            if (!documentId) {
                throw this.createAccessError(
                    'Document ID is required',
                    400,
                    'ACCESS001'
                );
            }

            const document = await this.documentService.retrieveDocument(documentId);

            if (!document) {
                throw this.createAccessError(
                    'Document not found',
                    404,
                    'ACCESS002'
                );
            }

            await this.validateUserAttributes(req.userAttributes);

            const accessResult = await this.opaService.evaluateAccess(
                req.userAttributes,
                {
                    clearance: document.document.clearance,
                    releasableTo: document.document.releasableTo,
                    coiTags: document.document.coiTags,
                    lacvCode: document.document.lacvCode
                },
                'read'
            );

            if (!accessResult.allow) {
                await this.handleAccessDenial(
                    req.userAttributes,
                    documentId,
                    action,
                    accessResult.reason
                );

                throw this.createAccessError(
                    'Access denied',
                    403,
                    'ACCESS003',
                    {
                        reason: accessResult.reason,
                        requiredClearance: document.document.clearance
                    }
                );
            }

            await this.recordAccessAttempt(
                req.userAttributes.uniqueIdentifier,
                documentId,
                action,
                true
            );

            req.document = document.document;

            await this.metrics.recordOperationMetrics('document_access', {
                duration: Date.now() - startTime,
                documentId,
                action,
                clearance: document.document.clearance
            });

            next();

        } catch (error) {
            const accessError = this.createAccessError(
                error.message || 'Access validation failed',
                error.statusCode || 403,
                error.code || 'ACCESS000'
            );

            this.logger.warn('Document access denied', {
                error: accessError,
                userId: req.userAttributes?.uniqueIdentifier,
                documentId: req.params.id,
                action: req.method,
                requestId
            });

            res.status(accessError.statusCode).json({
                error: accessError.message,
                code: accessError.code,
                details: accessError.details
            });
        }
    };

    /**
     * Validates document security attribute modifications to ensure they comply
     * with NATO security policies. This is critical for preventing unauthorized
     * security classification changes.
     */
    public validateSecurityModification = async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const documentId = req.params.id;
            const currentDocument = await this.documentService.retrieveDocument(documentId);

            if (!currentDocument) {
                throw this.createAccessError(
                    'Document not found',
                    404,
                    'ACCESS002'
                );
            }

            // Detect changes to security attributes
            const securityChanges = this.detectSecurityChanges(
                currentDocument.document,
                req.body
            );

            if (securityChanges.hasChanges) {
                // Validate user has appropriate clearance for modifications
                const validationResult = await this.validateSecurityChanges(
                    req.userAttributes,
                    currentDocument.document,
                    securityChanges.changes
                );

                if (!validationResult.valid) {
                    throw this.createAccessError(
                        'Insufficient clearance for security modifications',
                        403,
                        'ACCESS004',
                        { violations: validationResult.errors }
                    );
                }
            }

            next();

        } catch (error) {
            const accessError = this.createAccessError(
                error instanceof Error ? error.message : 'Security modification validation failed',
                error instanceof asAuthError ? 403 : 403,
                error instanceof asAuthError ? 'ACCESS000' : 'ACCESS000'
            );

            this.logger.error('Security modification validation error:', {
                error: accessError,
                userId: req.userAttributes?.uniqueIdentifier,
                documentId: req.params.id
            });

            res.status(accessError.statusCode).json({
                error: accessError.message,
                code: accessError.code,
                details: accessError.details
            });
        }
    };

    private validateSecurityHeaders(req: AuthenticatedRequest): void {
        const missingHeaders = this.SECURITY_CONFIG.REQUIRED_SECURITY_HEADERS
            .filter(header => !req.headers[header]);

        if (missingHeaders.length > 0) {
            throw this.createAccessError(
                'Missing required security headers',
                400,
                'ACCESS005',
                { missingHeaders }
            );
        }
    }

    private async validateUserAttributes(attributes: UserAttributes): Promise<void> {
        const validation = await this.opaService.validateAttributes(attributes);

        if (!validation.valid) {
            throw this.createAccessError(
                'Invalid user security attributes',
                401,
                'ACCESS006',
                { missingAttributes: validation.missingAttributes }
            );
        }
    }

    private async handleAccessDenial(
        userAttributes: UserAttributes,
        documentId: string,
        action: string,
        reason: string
    ): Promise<void> {
        await this.metrics.recordDocumentAccess(
            userAttributes.clearance as ClearanceLevel,
            false,
            {
                documentId,
                action,
                reason
            }
        );

        const recentFailures = await this.getRecentFailedAttempts(
            userAttributes.uniqueIdentifier,
            documentId
        );

        if (recentFailures >= this.SECURITY_CONFIG.SUSPICIOUS_ACCESS_THRESHOLD) {
            await this.handleSuspiciousActivity(userAttributes, documentId, recentFailures);
        }
    }

    private async recordAccessAttempt(
        userId: string,
        documentId: string,
        action: string,
        success: boolean
    ): Promise<void> {
        try {
            // Record the access attempt in metrics
            await this.metrics.recordDocumentAccess(
                'UNCLASSIFIED',
                success,
                {
                    userId,
                    action,
                    timestamp: new Date()
                }
            );

            // If access failed, check for suspicious patterns
            if (!success) {
                const recentFailures = await this.getRecentFailedAttempts(
                    userId,
                    documentId
                );

                if (recentFailures >= this.SECURITY_CONFIG.SUSPICIOUS_ACCESS_THRESHOLD) {
                    this.logger.warn('Suspicious access pattern detected', {
                        userId,
                        documentId,
                        failedAttempts: recentFailures
                    });

                    // Trigger enhanced monitoring
                    await this.metrics.recordSecurityEvent('suspicious_access', {
                        userId,
                        documentId,
                        failedAttempts: recentFailures,
                        timestamp: new Date()
                    });
                }
            }

        } catch (error) {
            this.logger.error('Error recording access attempt:', error);
            // Don't throw - we don't want metrics to break access control
        }
    }

    private async getRecentFailedAttempts(
        userId: string,
        documentId: string
    ): Promise<number> {
        const timeWindow = 3600; // 1 hour
        return await this.metrics.getFailedAccessCount(userId, documentId, timeWindow);
    }

    private async handleSuspiciousActivity(
        userAttributes: UserAttributes,
        documentId: string,
        failedAttempts: number
    ): Promise<void> {
        await this.metrics.recordSecurityEvent('suspicious_activity', {
            userId: userAttributes.uniqueIdentifier,
            documentId,
            failedAttempts,
            timestamp: new Date()
        });

        this.logger.warn('Suspicious activity detected', {
            userId: userAttributes.uniqueIdentifier,
            documentId,
            failedAttempts
        });
    }

    /**
     * Detects changes to security-related attributes in document updates.
     * This ensures all security-relevant modifications are properly tracked.
     */
    private detectSecurityChanges(
        currentDocument: NATODocument,
        updates: Partial<NATODocument>
    ): {
        hasChanges: boolean;
        changes: Record<string, any>;
    } {
        const changes: Record<string, any> = {};
        let hasChanges = false;

        // Check classification changes
        if (updates.clearance && updates.clearance !== currentDocument.clearance) {
            changes.clearance = {
                from: currentDocument.clearance,
                to: updates.clearance
            };
            hasChanges = true;
        }

        // Check releasability changes
        if (updates.releasableTo && Array.isArray(updates.releasableTo)) {
            const addedMarkers = updates.releasableTo.filter(
                marker => !currentDocument.releasableTo.includes(marker)
            );
            const removedMarkers = currentDocument.releasableTo.filter(
                marker => !updates.releasableTo?.includes(marker)
            );

            if (addedMarkers.length > 0 || removedMarkers.length > 0) {
                changes.releasableTo = { addedMarkers, removedMarkers };
                hasChanges = true;
            }
        }

        // Check COI tag changes
        if (updates.coiTags && Array.isArray(updates.coiTags)) {
            const addedTags = updates.coiTags.filter(
                tag => !currentDocument.coiTags?.includes(tag)
            );
            const removedTags = currentDocument.coiTags?.filter(
                tag => !updates.coiTags?.includes(tag)
            ) || [];

            if (addedTags.length > 0 || removedTags.length > 0) {
                changes.coiTags = { addedTags, removedTags };
                hasChanges = true;
            }
        }

        // Check LACV code changes
        if (updates.lacvCode !== undefined &&
            updates.lacvCode !== currentDocument.lacvCode) {
            changes.lacvCode = {
                from: currentDocument.lacvCode,
                to: updates.lacvCode
            };
            hasChanges = true;
        }

        return { hasChanges, changes };
    }

    /**
     * Validates that security changes comply with NATO policies and user clearance.
     * This method ensures that security classifications can only be modified by
     * users with appropriate authority and within policy guidelines.
     */
    private async validateSecurityChanges(
        userAttributes: UserAttributes,
        currentDocument: NATODocument,
        changes: Record<string, any>
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Validate clearance level changes
            if (changes.clearance) {
                const canModifyClearance = await this.opaService.evaluateClearanceModification(
                    userAttributes,
                    changes.clearance.from,
                    changes.clearance.to
                );

                if (!canModifyClearance.allow) {
                    errors.push(
                        `Insufficient clearance to modify document classification from ` +
                        `${changes.clearance.from} to ${changes.clearance.to}`
                    );
                }

                // Check for classification downgrade attempts
                if (this.getSecurityLevel(changes.clearance.to) <
                    this.getSecurityLevel(changes.clearance.from)) {
                    errors.push('Security classification cannot be downgraded');
                }
            }

            // Validate releasability marker changes
            if (changes.releasableTo) {
                const { addedMarkers, removedMarkers } = changes.releasableTo;

                // Validate additions
                for (const marker of addedMarkers) {
                    if (!this.isValidReleasabilityMarker(marker)) {
                        errors.push(`Invalid releasability marker: ${marker}`);
                        continue;
                    }

                    const canAddMarker = await this.opaService.evaluateReleasabilityModification(
                        userAttributes,
                        marker
                    );

                    if (!canAddMarker.allow) {
                        errors.push(`Unauthorized to add releasability marker: ${marker}`);
                    }
                }

                // Validate removals
                for (const marker of removedMarkers) {
                    const canRemoveMarker = await this.opaService.evaluateReleasabilityModification(
                        userAttributes,
                        marker
                    );

                    if (!canRemoveMarker.allow) {
                        errors.push(`Unauthorized to remove releasability marker: ${marker}`);
                    }
                }

                // Ensure at least one releasability marker remains
                if (currentDocument.releasableTo.length - removedMarkers.length +
                    addedMarkers.length === 0) {
                    errors.push('Document must maintain at least one releasability marker');
                }
            }

            // Validate COI tag changes
            if (changes.coiTags) {
                const { addedTags, removedTags } = changes.coiTags;

                // Validate user has all required COI memberships
                for (const tag of addedTags) {
                    if (!userAttributes.coiTags?.includes(tag)) {
                        errors.push(`User lacks required COI membership: ${tag}`);
                    }
                }

                // Check for required COI tags based on document classification
                const requiredTags = this.getRequiredCoiTags(currentDocument.clearance);
                for (const tag of removedTags) {
                    if (requiredTags.includes(tag)) {
                        errors.push(`Cannot remove required COI tag: ${tag}`);
                    }
                }
            }

            // Validate LACV code changes
            if (changes.lacvCode) {
                const { from, to } = changes.lacvCode;

                // Only users with matching LACV code or COSMIC TOP SECRET can modify
                if (to &&
                    userAttributes.clearance !== 'COSMIC TOP SECRET' &&
                    userAttributes.lacvCode !== to) {
                    errors.push('Insufficient privileges to modify LACV code');
                }

                // Validate LACV code format
                if (to && !this.isValidLacvCode(to)) {
                    errors.push(`Invalid LACV code format: ${to}`);
                }
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            this.logger.error('Error validating security changes:', error);
            errors.push('Security validation system error');
            return { valid: false, errors, warnings };
        }
    }

    /**
     * Determines numeric security level for classification comparisons.
     * This hierarchy follows NATO security classification standards.
     */
    public getSecurityLevel(clearance: string): number {
        return SECURITY_CONSTANTS.CLEARANCE_LEVELS[clearance] || 0;
    }

    /**
     * Gets required COI tags based on document classification level.
     * Some classifications mandate specific Communities of Interest.
     */
    private getRequiredCoiTags(clearance: string): string[] {
        // Map classification levels to required COI tags
        const requiredTags: Record<string, string[]> = {
            'NATO SECRET': ['OpAlpha', 'OpBravo'],
            'COSMIC TOP SECRET': ['OpAlpha', 'OpBravo', 'OpGamma']
        };
        return requiredTags[clearance] || [];
    }

    /**
     * Validates releasability marker format according to NATO standards.
     */
    private isValidReleasabilityMarker(marker: string): boolean {
        const validMarkers = [
            'NATO',
            'EU',
            'FVEY',
            'PARTNERX'
            // Add other valid markers as needed
        ];
        return validMarkers.includes(marker);
    }

    /**
     * Validates LACV code format according to NATO standards.
     */
    private isValidLacvCode(code: string): boolean {
        // LACV codes follow the pattern LACVnnn where nnn is a 3-digit number
        const validCodes = [
            'LACV001',
            'LACV002',
            'LACV003',
            'LACV004'
        ];
        return validCodes.includes(code);
    }

    /**
     * Creates standardized access error objects with security context.
     */
    private createAccessError(
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

    private determineRequestedAction(req: AuthenticatedRequest): string {
        const methodMap: Record<string, string> = {
            'GET': 'read',
            'POST': 'create',
            'PUT': 'update',
            'DELETE': 'delete'
        };
        return methodMap[req.method] || 'unknown';
    }

    private async validateClassificationInheritance(document: NATODocument): Promise<ValidationResult> {
        const parentId = document.metadata?.parentDocument;
        if (parentId) {
            const parentDoc = await this.documentService.retrieveDocument(parentId);
            if (this.getSecurityLevel(document.clearance) <
                this.getSecurityLevel(parentDoc.clearance)) {
                return {
                    valid: false,
                    errors: ['Derived document cannot have lower classification than parent']
                };
            }
        }
        return { valid: true, errors: [] };
    }
}

export default DocumentAccessMiddleware.getInstance();
