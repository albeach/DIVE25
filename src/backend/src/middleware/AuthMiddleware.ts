import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PingFederateService } from '../services/PingFederateService';
import { FederationMonitoringService } from '../services/FederationMonitoringService';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { OPAService } from '../services/OPAService';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { 
    AuthenticatedRequest, 
    AuthError, 
    UserAttributes,
    ClearanceLevel,
    CoiTag,
    LacvCode 
} from '../types';
import { asAuthError } from './errorHandler';

export class AuthMiddleware {
    private static instance: AuthMiddleware;
    private readonly pingFedService: PingFederateService;
    private readonly monitoringService: FederationMonitoringService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly opa: OPAService;
    private readonly redis: Redis;

    // Security configuration
    private readonly SECURITY_CONFIG = {
        TOKEN_EXPIRY_BUFFER: 300, // 5 minutes
        MAX_TOKEN_AGE: 3600, // 1 hour
        REQUIRED_ATTRIBUTES: [
            'uniqueIdentifier',
            'countryOfAffiliation',
            'clearance'
        ],
        CLEARANCE_LEVELS: [
            'UNCLASSIFIED',
            'RESTRICTED',
            'NATO CONFIDENTIAL',
            'NATO SECRET',
            'COSMIC TOP SECRET'
        ] as ClearanceLevel[],
        RATE_LIMIT: {
            WINDOW_MS: 900000, // 15 minutes
            MAX_REQUESTS: 100
        }
    };

    private constructor() {
        this.pingFedService = PingFederateService.getInstance();
        this.monitoringService = FederationMonitoringService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.opa = OPAService.getInstance();
        
        this.redis = new Redis({
            ...config.redis,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy: (times: number) => Math.min(times * 50, 2000)
        });

        this.initializeErrorHandling();
    }

    public static getInstance(): AuthMiddleware {
        if (!AuthMiddleware.instance) {
            AuthMiddleware.instance = new AuthMiddleware();
        }
        return AuthMiddleware.instance;
    }

    private initializeErrorHandling(): void {
        this.redis.on('error', (error) => {
            this.logger.error('Redis connection error:', error);
            this.metrics.recordOperationError('redis_auth', error);
        });
    }

    public authenticate: RequestHandler = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const startTime = Date.now();
        const partnerId = req.headers['x-federation-partner'] as string;
        const requestId = req.headers['x-request-id'] as string;

        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                throw this.createAuthError('No token provided', 401, 'AUTH001');
            }

            const token = authHeader.split(' ')[1];
            await this.checkRateLimit(req.ip);

            const userInfo = await this.pingFedService.validateToken(token);
            await this.validateTokenExpiration(userInfo);
            await this.validateSecurityAttributes(userInfo);

            (req as AuthenticatedRequest).userAttributes = userInfo;

            await this.monitoringService.recordAuthenticationAttempt(
                partnerId,
                'bearer_token',
                true
            );

            await this.metrics.recordOperationMetrics('authentication', {
                duration: Date.now() - startTime,
                partnerId,
                success: true
            });

            next();
        } catch (error) {
            if (partnerId) {
                await this.monitoringService.recordAuthenticationAttempt(
                    partnerId,
                    'bearer_token',
                    false,
                    error.message
                );
            }

            const authError = this.createAuthError(
                error.message || 'Authentication failed',
                error.statusCode || 401,
                error.code || 'AUTH000'
            );

            this.logger.error('Authentication error:', {
                error: authError,
                partnerId,
                requestId,
                ip: req.ip
            });

            res.status(authError.statusCode).json({
                error: authError.message,
                code: authError.code,
                details: authError.details
            });
        }
    };

    private async checkRateLimit(ip: string): Promise<void> {
        const key = `ratelimit:${ip}`;
        const count = await this.redis.incr(key);
        
        if (count === 1) {
            await this.redis.expire(key, this.SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS / 1000);
        }

        if (count > this.SECURITY_CONFIG.RATE_LIMIT.MAX_REQUESTS) {
            throw this.createAuthError(
                'Rate limit exceeded',
                429,
                'AUTH007'
            );
        }
    }

    public extractUserAttributes: RequestHandler = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.headers.authorization) {
                throw this.createAuthError('No token provided', 401, 'AUTH001');
            }

            const userAttributes: UserAttributes = {
                uniqueIdentifier: req.headers['x-user-id'] as string,
                clearance: this.validateClearanceLevel(
                    req.headers['x-user-clearance'] as string
                ),
                countryOfAffiliation: req.headers['x-user-country'] as string,
                coiTags: this.validateCoiTags(
                    (req.headers['x-user-coi'] as string || '').split(',')
                ),
                lacvCode: this.validateLacvCode(
                    req.headers['x-user-lacv'] as string
                ),
                organizationalAffiliation: req.headers['x-user-org'] as string
            };

            const validationResult = await this.opa.validateAttributes(userAttributes);
            if (!validationResult.valid) {
                throw this.createAuthError(
                    'Invalid user attributes',
                    401,
                    'AUTH003',
                    { missingAttributes: validationResult.missingAttributes }
                );
            }

            (req as AuthenticatedRequest).userAttributes = userAttributes;
            next();
        } catch (error) {
            const authError = asAuthError(error);
            res.status(authError.statusCode || 401).json({
                error: authError.message || 'Failed to extract user attributes',
                code: authError.code || 'AUTH003',
                details: authError.details
            });
        }
    };

    public requireClearance = (requiredClearance: ClearanceLevel): RequestHandler => {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            try {
                const userClearance = (req as AuthenticatedRequest).userAttributes.clearance;
                const hasAccess = await this.opa.evaluateClearanceAccess(
                    userClearance,
                    requiredClearance
                );

                if (!hasAccess.allow) {
                    throw this.createAuthError(
                        'Insufficient clearance level',
                        403,
                        'AUTH004',
                        { required: requiredClearance, provided: userClearance }
                    );
                }

                next();
            } catch (error) {
                const authError = asAuthError(error);
                res.status(authError.statusCode || 403).json({
                    error: authError.message || 'Access denied',
                    code: authError.code || 'AUTH004',
                    details: authError.details
                });
            }
        };
    };

    private validateClearanceLevel(clearance: string): ClearanceLevel {
        if (!this.SECURITY_CONFIG.CLEARANCE_LEVELS.includes(clearance as ClearanceLevel)) {
            throw this.createAuthError(
                'Invalid clearance level',
                401,
                'AUTH008',
                { validLevels: this.SECURITY_CONFIG.CLEARANCE_LEVELS }
            );
        }
        return clearance as ClearanceLevel;
    }

    private validateCoiTags(tags: string[]): CoiTag[] {
        const validTags = [
            'OpAlpha',
            'OpBravo',
            'OpGamma',
            'MissionX',
            'MissionZ'
        ];

        const validatedTags = tags
            .filter(tag => tag !== '')
            .map(tag => {
                if (!validTags.includes(tag)) {
                    throw this.createAuthError(
                        'Invalid COI tag',
                        401,
                        'AUTH009',
                        { invalidTag: tag, validTags }
                    );
                }
                return tag as CoiTag;
            });

        return validatedTags;
    }

    private validateLacvCode(code: string | undefined): LacvCode | undefined {
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

        return code as LacvCode;
    }

    private createAuthError(
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

    private async validateTokenExpiration(userInfo: any): Promise<void> {
        const now = Math.floor(Date.now() / 1000);
        
        if (userInfo.exp && userInfo.exp - now < this.SECURITY_CONFIG.TOKEN_EXPIRY_BUFFER) {
            throw this.createAuthError('Token is about to expire', 401, 'AUTH005');
        }

        if (userInfo.iat && now - userInfo.iat > this.SECURITY_CONFIG.MAX_TOKEN_AGE) {
            throw this.createAuthError('Token has exceeded maximum age', 401, 'AUTH006');
        }
    }

    private async validateSecurityAttributes(userInfo: any): Promise<void> {
        const validationResult = await this.opa.validateAttributes({
            uniqueIdentifier: userInfo.uniqueIdentifier,
            countryOfAffiliation: userInfo.countryOfAffiliation,
            clearance: userInfo.clearance,
            coiTags: userInfo.coiTags,
            lacvCode: userInfo.lacvCode
        });

        if (!validationResult.valid) {
            throw this.createAuthError(
                'Invalid security attributes',
                401,
                'AUTH007',
                { missingAttributes: validationResult.missingAttributes }
            );
        }
    }
}

export default AuthMiddleware.getInstance();