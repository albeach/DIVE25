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
    ValidationResult
} from '../types';

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

    // Security policy enforcement configuration
    private readonly SECURITY_CONFIG = {
        // Allow 5 minutes for classification changes to propagate
        CLASSIFICATION_CHANGE_WINDOW: 300,
        
        // Trigger enhanced monitoring after this many failed attempts
        MAX_FAILED_ATTEMPTS: 3,
        
        // Time window for counting failed attempts (1 hour)
        FAILED_ATTEMPT_WINDOW: 3600
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
        
        try {
            // Extract document ID from request
            const documentId = req.params.id || req.body.documentId;
            
            if (!documentId) {
                throw this.createAccessError(
                    'Document ID is required',
                    400,
                    'ACCESS001'
                );
            }

            // Retrieve document with security metadata
            const document = await this.documentService.retrieveDocument(documentId);
            
            if (!document) {
                throw this.createAccessError(
                    'Document not found',
                    404,
                    'ACCESS002'
                );
            }

            // Determine the requested action
            const action = this.determineRequestedAction(req);

            // Validate user attributes
            await this.validateUserAttributes(req.userAttributes);

            // Evaluate access using NATO ABAC policy
            const accessResult = await this.opaService.evaluateAccess(
                req.userAttributes,
                document,
                action
            );

            if (!accessResult.allow) {
                // Record access denial with security context
                await this.recordAccessDenial(
                    req.userAttributes.uniqueIdentifier,
                    documentId,
                    action,
                    accessResult.reason || 'Access denied by policy'
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

            // Record successful access attempt
            await this.recordAccessAttempt(
                req.userAttributes.uniqueIdentifier,
                documentId,
                action,
                true
            );

            // Attach validated document to request for downstream handlers
            req.document = document.document;

            // Record access validation duration for performance monitoring
            await this.metrics.recordOperationMetrics('access_validation', {
                duration: Date.now() - startTime,
                documentId,
                action
            });

            next();

        } catch (error) {
            const accessError = this.createAccessError(
                error instanceof Error ? error.message : 'Access validation failed',
                error instanceof AuthError ? error.statusCode : 403,
                error instanceof AuthError ? error.code : 'ACCESS000'
            );

            // Log access denial with context
            this.logger.warn('Document access denied', {
                error: accessError,
                userId: req.userAttributes?.uniqueIdentifier,
                documentId: req.params.id,
                action: req.method,
                requestId: req.headers['x-request-id']
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
                error instanceof AuthError ? error.statusCode : 403,
                error instanceof AuthError ? error.code : 'ACCESS000'
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

    /**
     * Records access attempts and monitors for suspicious patterns.
     * This helps detect potential security breaches or misuse attempts.
     */
    private async recordAccessAttempt(
        userId: string,
        documentId: string,
        action: string,
        success: boolean
    ): Promise<void> {
        try {
            // Record the access attempt in metrics
            await this.metrics.recordDocumentAccess(
                documentId,
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

                if (recentFailures >= this.SECURITY_CONFIG.MAX_FAILED_ATTEMPTS) {
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

                const canAddMarker = await this.opaService.evaluateReleasabilityAddition(
                    userAttributes,
                    marker
                );

                if (!canAddMarker.allow) {
                    errors.push(`Unauthorized to add releasability marker: ${marker}`);
                }
            }

            // Validate removals
            for (const marker of removedMarkers) {
                const canRemoveMarker = await this.opaService.evaluateReleasabilityRemoval(
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
    const levels: Record<string, number> = {
        'UNCLASSIFIED': 0,
        'RESTRICTED': 1,
        'NATO CONFIDENTIAL': 2,
        'NATO SECRET': 3,
        'COSMIC TOP SECRET': 4
    };
    return levels[clearance] || 0;
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
}

export default DocumentAccessMiddleware.getInstance();