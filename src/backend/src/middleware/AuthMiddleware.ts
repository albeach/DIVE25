import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { Redis } from 'ioredis';
import { OPAService } from '../services/OPAService';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { config } from '../config/config';
import { AuthenticatedRequest, UserAttributes, ResourceAttributes } from '../types';

export class AuthError extends Error {
    constructor(message: string, public statusCode: number) {
        super(message);
        this.name = 'AuthError';
    }
}

export class AuthMiddleware {
    private static instance: AuthMiddleware;
    private readonly opaService: OPAService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly redis: Redis;
    private publicKey: string | null = null;

    private constructor() {
        this.opaService = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.redis = new Redis(config.redis);

        this.initializeKeycloak();
    }

    private async initializeKeycloak(): Promise<void> {
        try {
            const response = await axios.get(
                `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`
            );
            this.publicKey = response.data.keys[0].x5c[0];
        } catch (error) {
            this.logger.error('Failed to initialize Keycloak:', error);
            throw error;
        }
    }

    public authenticate = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const startTime = Date.now();
        try {
            const token = this.extractToken(req);
            if (!token) {
                throw new AuthError('No token provided', 401);
            }

            const decodedToken = await this.verifyToken(token);
            const userAttributes = this.mapKeycloakAttributes(decodedToken);

            const resourceAttributes: ResourceAttributes = {
                path: req.path,
                method: req.method,
                resourceType: 'api'
            };

            const accessResult = await this.opaService.evaluateAccess(
                userAttributes,
                resourceAttributes
            );

            if (!accessResult.allow) {
                throw new AuthError(
                    accessResult.reason || 'Access denied',
                    403
                );
            }

            (req as AuthenticatedRequest).userAttributes = userAttributes;

            this.metrics.recordAuthSuccess(userAttributes.organization);

            next();
        } catch (error) {
            this.handleAuthError(error, req, res);
        } finally {
            this.metrics.recordAuthDuration(Date.now() - startTime);
        }
    };

    private extractToken(req: Request): string | null {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }

    private async verifyToken(token: string): Promise<any> {
        try {
            return jwt.verify(token, this.publicKey!, {
                algorithms: ['RS256']
            });
        } catch (error) {
            throw new AuthError('Invalid token', 401);
        }
    }

    private mapKeycloakAttributes(decodedToken: any): UserAttributes {
        return {
            uniqueIdentifier: decodedToken.sub,
            organization: decodedToken.organization,
            clearance: decodedToken.clearance_level,
            coiAccess: decodedToken.coi_access || [],
            releasabilityAccess: decodedToken.releasability || []
        };
    }

    private handleAuthError(error: any, req: Request, res: Response): void {
        this.logger.error('Authentication error:', {
            error,
            path: req.path,
            method: req.method
        });

        this.metrics.recordAuthFailure(
            error.message,
            req.headers['x-federation-partner'] as string
        );

        res.status(error.statusCode || 401).json({
            error: error.message || 'Authentication failed',
            code: error.code || 'AUTH001'
        });
    }

    public static getInstance(): AuthMiddleware {
        if (!AuthMiddleware.instance) {
            AuthMiddleware.instance = new AuthMiddleware();
        }
        return AuthMiddleware.instance;
    }
}