// src/services/SecurityValidationService.ts

import { OPAService } from './OPAService';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import {
    UserAttributes,
    NATODocument,
    ValidationResult,
    ClearanceLevel,
    CoiTag,
    LacvCode,
    ReleasabilityMarker,
    AuthError
} from '../types';
import { SECURITY_CONSTANTS } from '../constants/security';

export class SecurityValidationService {
    private static instance: SecurityValidationService;
    private readonly opaService: OPAService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    // NATO Security Policy Constants
    private readonly CLASSIFICATION_LEVELS = SECURITY_CONSTANTS.CLEARANCE_LEVELS;
    private readonly SECURITY_POLICY = {
        VALID_RELEASABILITY_MARKERS: SECURITY_CONSTANTS.VALID_RELEASABILITY_MARKERS as ReleasabilityMarker[],
        VALID_COI_TAGS: SECURITY_CONSTANTS.VALID_COI_TAGS as CoiTag[],
        VALID_LACV_CODES: SECURITY_CONSTANTS.VALID_LACV_CODES as LacvCode[],
        REQUIRED_CLEARANCE_COIS: {
            'NATO SECRET': ['OpAlpha', 'OpBravo'],
            'COSMIC TOP SECRET': ['OpAlpha', 'OpBravo', 'OpGamma']
        }
    };

    private constructor() {
        this.opaService = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): SecurityValidationService {
        if (!SecurityValidationService.instance) {
            SecurityValidationService.instance = new SecurityValidationService();
        }
        return SecurityValidationService.instance;
    }

    /**
     * Validates document security attributes according to NATO standards
     */
    public async validateDocumentSecurity(
        document: Partial<NATODocument>,
        userAttributes: UserAttributes
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Validate classification level
            if (document.clearance) {
                const clearanceValid = this.validateClassificationLevel(
                    document.clearance,
                    userAttributes.clearance
                );
                if (!clearanceValid.valid) {
                    errors.push(...clearanceValid.errors);
                }
            }

            // Validate releasability markers
            if (document.releasableTo) {
                const releasabilityValid = this.validateReleasabilityMarkers(
                    document.releasableTo
                );
                if (!releasabilityValid.valid) {
                    errors.push(...releasabilityValid.errors);
                }
            }

            // Validate COI tags
            if (document.coiTags) {
                const coiValid = await this.validateCoiTags(
                    document.coiTags,
                    userAttributes,
                    document.clearance as ClearanceLevel
                );
                if (!coiValid.valid) {
                    errors.push(...coiValid.errors);
                }
            }

            // Validate LACV code
            if (document.lacvCode) {
                const lacvValid = this.validateLacvCode(
                    document.lacvCode,
                    userAttributes
                );
                if (!lacvValid.valid) {
                    errors.push(...lacvValid.errors);
                }
            }

            // Record validation metrics
            await this.metrics.recordOperationMetrics('security_validation', {
                success: errors.length === 0,
                errorCount: errors.length,
                documentClearance: document.clearance
            });

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            this.logger.error('Security validation error:', error);
            throw this.createSecurityError(
                'Security validation failed',
                500,
                'SEC001',
                { originalError: error.message }
            );
        }
    }

    private async validateReleasabilityChange(
        currentMarkers: ReleasabilityMarker[],
        proposedMarkers: ReleasabilityMarker[],
        userAttributes: UserAttributes
    ): Promise<ValidationResult> {
        const errors: string[] = [];

        // Check for valid markers
        const validationResult = this.validateReleasabilityMarkers(proposedMarkers);
        if (!validationResult.valid) {
            errors.push(...validationResult.errors);
        }

        // Ensure at least one marker remains
        if (proposedMarkers.length === 0) {
            errors.push('At least one releasability marker is required');
        }

        // Check user's authority to modify markers
        if (userAttributes.clearance !== 'NATO SECRET' &&
            userAttributes.clearance !== 'COSMIC TOP SECRET') {
            errors.push('Insufficient clearance to modify releasability markers');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validates security modifications according to NATO policies
     */
    public async validateSecurityModification(
        currentDocument: NATODocument,
        proposedChanges: Partial<NATODocument>,
        userAttributes: UserAttributes
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Check classification changes
            if (proposedChanges.clearance &&
                proposedChanges.clearance !== currentDocument.clearance) {

                const classificationValid = await this.validateClassificationChange(
                    currentDocument.clearance,
                    proposedChanges.clearance,
                    userAttributes
                );

                if (!classificationValid.valid) {
                    errors.push(...classificationValid.errors);
                }
            }

            // Check releasability changes
            if (proposedChanges.releasableTo) {
                const releasabilityValid = await this.validateReleasabilityChange(
                    currentDocument.releasableTo,
                    proposedChanges.releasableTo,
                    userAttributes
                );

                if (!releasabilityValid.valid) {
                    errors.push(...releasabilityValid.errors);
                }
            }

            // Additional validations...

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            this.logger.error('Security modification validation error:', error);
            throw this.createSecurityError(
                'Security modification validation failed',
                500,
                'SEC002',
                { originalError: error.message }
            );
        }
    }

    private validateClassificationLevel(
        documentClearance: ClearanceLevel,
        userClearance: ClearanceLevel
    ): ValidationResult {
        const errors: string[] = [];

        if (!this.CLASSIFICATION_LEVELS.hasOwnProperty(documentClearance)) {
            errors.push(`Invalid classification level: ${documentClearance}`);
            return { valid: false, errors };
        }

        const userLevel = this.CLASSIFICATION_LEVELS[userClearance];
        const docLevel = this.CLASSIFICATION_LEVELS[documentClearance];

        if (userLevel < docLevel) {
            errors.push('User clearance insufficient for document classification');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private async validateClassificationChange(
        currentClearance: ClearanceLevel,
        proposedClearance: ClearanceLevel,
        userAttributes: UserAttributes
    ): Promise<ValidationResult> {
        const errors: string[] = [];

        // Check if user has authority to modify classifications
        const canModify = await this.opaService.evaluateClearanceModification(
            userAttributes,
            currentClearance,
            proposedClearance
        );

        if (!canModify.allow) {
            errors.push(`Unauthorized to modify classification from ${currentClearance} to ${proposedClearance}`);
        }

        // Prevent classification downgrades
        const currentLevel = this.CLASSIFICATION_LEVELS[currentClearance];
        const proposedLevel = this.CLASSIFICATION_LEVELS[proposedClearance];

        if (proposedLevel < currentLevel) {
            errors.push('Classification downgrade not permitted');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private createSecurityError(
        message: string,
        statusCode: number,
        code: string,
        details?: Record<string, unknown>
    ): AuthError {
        const error = new Error(message) as AuthError;
        error.statusCode = statusCode;
        error.code = code;
        error.details = details;
        return error;
    }

    private validateReleasabilityMarkers(markers: string[]): ValidationResult {
        const errors: string[] = [];

        if (!markers || markers.length === 0) {
            errors.push('At least one releasability marker is required');
            return { valid: false, errors };
        }

        const invalidMarkers = markers.filter(
            marker => !this.SECURITY_POLICY.VALID_RELEASABILITY_MARKERS.includes(marker as ReleasabilityMarker)
        );

        if (invalidMarkers.length > 0) {
            errors.push(`Invalid releasability markers: ${invalidMarkers.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private async validateCoiTags(
        tags: string[],
        userAttributes: UserAttributes,
        clearance: ClearanceLevel
    ): Promise<ValidationResult> {
        const errors: string[] = [];

        if (tags && tags.length > 0) {
            const invalidTags = tags.filter(
                tag => !this.SECURITY_POLICY.VALID_COI_TAGS.includes(tag as CoiTag)
            );

            if (invalidTags.length > 0) {
                errors.push(`Invalid COI tags: ${invalidTags.join(', ')}`);
            }

            // Check user has required COI memberships
            const missingTags = tags.filter(
                tag => !userAttributes.coiTags?.includes(tag as CoiTag)
            );

            if (missingTags.length > 0) {
                errors.push(`User lacks required COI memberships: ${missingTags.join(', ')}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private validateLacvCode(
        code: string,
        userAttributes: UserAttributes
    ): ValidationResult {
        const errors: string[] = [];

        if (code) {
            if (!this.SECURITY_POLICY.VALID_LACV_CODES.includes(code as LacvCode)) {
                errors.push(`Invalid LACV code: ${code}`);
            }

            if (userAttributes.clearance !== 'COSMIC TOP SECRET' &&
                userAttributes.lacvCode !== code) {
                errors.push('User not authorized for this LACV code');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export default SecurityValidationService.getInstance();