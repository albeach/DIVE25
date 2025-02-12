import { Response, NextFunction } from 'express';
import { PingFederateService } from '../services/PingFederateService';
import { FederationMonitoringService } from '../services/FederationMonitoringService';
import { LoggerService } from '../services/LoggerService';
import { OPAService } from '../services/OPAService';
import { 
    AuthenticatedRequest, 
    AuthError, 
    UserAttributes,
    RequestWithFederation,
    ClearanceLevel,
    LacvCode,
    CoiTag
} from '../types';
import { asAuthError } from '../utils/errorUtils';
import { config } from '../config/config';

/**
 * Authentication and authorization middleware for the NATO document system.
 * Implements multi-factor authentication, token validation, and attribute-based
 * access control (ABAC) using PingFederate and OPA.
 */
export class AuthMiddleware {
    private static instance: AuthMiddleware;
    private readonly pingFedService: PingFederateService;
    private readonly monitoringService: FederationMonitoringService;
    private readonly logger: LoggerService;
    private readonly opa: OPAService;

    // Token validation configuration
    private readonly TOKEN_CONFIG = {
        EXPIRATION_BUFFER: 300, // 5 minutes buffer for token expiration
        MAX_TOKEN_AGE: 3600,    // 1 hour maximum token age
        REQUIRED_SCOPES: ['document.read', 'document.write']
    };

    private constructor() {
        this.pingFedService = PingFederateService.getInstance();
        this.monitoringService = FederationMonitoringService.getInstance();
        this.logger = LoggerService.getInstance();
        this.opa = OPAService.getInstance();
    }

    public static getInstance(): AuthMiddleware {
        if (!AuthMiddleware.instance) {
            AuthMiddleware.instance = new AuthMiddleware();
        }
        return AuthMiddleware.instance;
    }

    /**
     * Main authentication middleware that validates tokens and extracts user attributes.
     * Also handles federation partner authentication and monitoring.
     */
    public authenticate = async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const startTime = Date.now();
        const partnerId = req.headers['x-federation-partner'] as string;

        try {
            // Extract and validate authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                throw this.createAuthError('No token provided', 401, 'AUTH001');
            }

            const token = authHeader.split(' ')[1];

            // Validate token and get user information
            const userInfo = await this.pingFedService.validateToken(token);

            // Validate token expiration
            this.validateTokenExpiration(userInfo);

            // Validate required attributes
            if (!this.validateRequiredAttributes(userInfo)) {
                throw this.createAuthError(
                    'Missing required user attributes',
                    401,
                    'AUTH002'
                );
            }

            // Validate security classifications
            await this.validateSecurityAttributes(userInfo);

            // Record successful authentication
            await this.monitoringService.recordAuthenticationAttempt(
                partnerId,
                'bearer_token',
                true
            );

            // Record response time for monitoring
            await this.monitoringService.recordResponseTime(
                partnerId,
                'token_validation',
                Date.now() - startTime
            );

            // Attach user attributes to request
            req.userAttributes = userInfo;

            // Log successful authentication
            this.logger.info('Authentication successful', {
                userId: userInfo.uniqueIdentifier,
                partnerId,
                duration: Date.now() - startTime
            });

            next();

        } catch (error) {
            // Record authentication failure
            if (partnerId) {
                await this.monitoringService.recordAuthenticationAttempt(
                    partnerId,
                    'bearer_token',
                    false,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }

            const authError = asAuthError(error);

            this.logger.error('Authentication error', {
                error: authError,
                partnerId,
                requestId: req.headers['x-request-id']
            });

            res.status(authError.statusCode || 401).json({
                error: authError.message || 'Authentication failed',
                code: authError.code || 'AUTH000'
            });
        }
    };

    /**
     * Middleware to extract and validate user attributes from federation headers.
     * Ensures all required security attributes are present and valid.
     */
    public extractUserAttributes = async (
        req: RequestWithFederation,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.headers.authorization) {
                throw this.createAuthError('No token provided', 401, 'AUTH001');
            }

            // Extract user attributes from headers
            const userAttributes: UserAttributes = {
                uniqueIdentifier: req.headers['x-user-id'] as string,
                clearance: this.validateClearanceLevel(
                    req.headers['x-user-clearance'] as string
                ),
                countryOfAffiliation: req.headers['x-user-country'] as string,
                coiTags: this.validateCoiTags(
                    (req.headers['x-user-coi'] as string || '').split(',')
                ) as CoiTag[],
                lacvCode: this.validateLacvCode(
                    req.headers['x-user-lacv'] as string
                ) as LacvCode | undefined,
                organizationalAffiliation: req.headers['x-user-org'] as string
            };

            // Validate attributes with OPA
            const validationResult = await this.opa.validateAttributes(userAttributes);
            if (!validationResult.valid) {
                throw this.createAuthError(
                    'Invalid user attributes',
                    401,
                    'AUTH003',
                    { missingAttributes: validationResult.missingAttributes }
                );
            }

            // Attach validated attributes to request
            req.userAttributes = userAttributes;

            // Log attribute extraction
            this.logger.debug('User attributes extracted', {
                userId: userAttributes.uniqueIdentifier,
                clearance: userAttributes.clearance,
                requestId: req.headers['x-request-id']
            });

            next();

        } catch (error) {
            const authError = asAuthError(error);

            this.logger.error('User attributes extraction error', {
                error: authError,
                requestId: req.headers['x-request-id']
            });

            res.status(authError.statusCode || 401).json({
                error: authError.message || 'Failed to extract user attributes',
                code: authError.code || 'AUTH000',
                details: authError.details
            });
        }
    };

    /**
     * Middleware to check if user has required clearance level.
     * Used to protect sensitive operations and admin functions.
     */
    public requireClearance = (minimumClearance: ClearanceLevel) => {
        return async (
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ): Promise<void> => {
            try {
                const userClearance = req.userAttributes.clearance;
                const hasAccess = await this.opa.evaluateClearanceAccess(
                    userClearance,
                    minimumClearance
                );

                if (!hasAccess.allow) {
                    throw this.createAuthError(
                        'Insufficient clearance level',
                        403,
                        'AUTH004',
                        { 
                            required: minimumClearance,
                            provided: userClearance
                        }
                    );
                }

                // Log clearance check
                this.logger.debug('Clearance check passed', {
                    userId: req.userAttributes.uniqueIdentifier,
                    clearance: userClearance,
                    requiredClearance: minimumClearance
                });

                next();

            } catch (error) {
                const authError = asAuthError(error);

                this.logger.error('Clearance check error', {
                    error: authError,
                    userId: req.userAttributes?.uniqueIdentifier,
                    requestId: req.headers['x-request-id']
                });

                res.status(authError.statusCode || 403).json({
                    error: authError.message || 'Access denied',
                    code: authError.code || 'AUTH000',
                    details: authError.details
                });
            }
        };
    };

    /**
     * Validates all required user attributes are present and properly formatted.
     */
    private validateRequiredAttributes(userInfo: UserAttributes): boolean {
        const requiredAttributes = [
            'uniqueIdentifier',
            'countryOfAffiliation',
            'clearance'
        ];

        return requiredAttributes.every(attr => 
            userInfo[attr as keyof UserAttributes] !== undefined &&
            userInfo[attr as keyof UserAttributes] !== ''
        );
    }

    /**
     * Validates token expiration and age requirements.
     */
    private validateTokenExpiration(userInfo: any): void {
        const now = Math.floor(Date.now() / 1000);

        if (userInfo.exp && userInfo.exp - now < this.TOKEN_CONFIG.EXPIRATION_BUFFER) {
            throw this.createAuthError(
                'Token is about to expire',
                401,
                'AUTH005'
            );
        }

        if (userInfo.iat && now - userInfo.iat > this.TOKEN_CONFIG.MAX_TOKEN_AGE) {
            throw this.createAuthError(
                'Token has exceeded maximum age',
                401,
                'AUTH006'
            );
        }
    }

    /**
     * Validates user security attributes with OPA policies.
     */
    private async validateSecurityAttributes(
        userInfo: any
    ): Promise<void> {
        const validationResult = await this.opa.validateSecurityAttributes({
            clearance: userInfo.clearance,
            coiTags: userInfo.coiTags,
            lacvCode: userInfo.lacvCode
        });

        if (!validationResult.valid) {
            throw this.createAuthError(
                'Invalid security attributes',
                401,
                'AUTH007',
                { violations: validationResult.violations }
            );
        }
    }

    /**
     * Validates clearance level format and value.
     */
    private validateClearanceLevel(clearance: string): ClearanceLevel {
        const validClearances: ClearanceLevel[] = [
            'UNCLASSIFIED',
            'RESTRICTED',
            'NATO CONFIDENTIAL',
            'NATO SECRET',
            'COSMIC TOP SECRET'
        ];

        if (!validClearances.includes(clearance as ClearanceLevel)) {
            throw this.createAuthError(
                'Invalid clearance level',
                401,
                'AUTH008',
                { validLevels: validClearances }
            );
        }

        return clearance as ClearanceLevel;
    }

    /**
     * Validates COI tags format and values.
     */
    private validateCoiTags(tags: string[]): string[] {
        const validTags = [
            'OpAlpha',
            'OpBravo',
            'OpGamma',
            'MissionX',
            'MissionZ'
        ];

        const invalidTags = tags.filter(tag => !validTags.includes(tag));
        if (invalidTags.length > 0) {
            throw this.createAuthError(
                'Invalid COI tags',
                401,
                'AUTH009',
                { invalidTags }
            );
        }

        return tags.filter(tag => tag !== '');
    }

    /**
     * Validates LACV code format and value.
     */
    private validateLacvCode(code: string | undefined): string | undefined {
        if (!code) return undefined;

        const validCodes = [
            'LACV001',
            'LACV002',
            'LACV003',
            'LACV004'
        ];

        if (!validCodes.includes(code)) {
            throw this.createAuthError(
                'Invalid LACV code',
                401,
                'AUTH010',
                { validCodes }
            );
        }

        return code;
    }

    /**
     * Creates typed authentication error with proper error codes.
     */
    private createAuthError(
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
}

export default AuthMiddleware.getInstance();