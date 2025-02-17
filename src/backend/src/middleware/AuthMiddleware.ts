import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { Redis } from 'ioredis';
import { OPAService } from '../services/OPAService';
import { LoggerService } from '../services/LoggerService';
import { MetricsService } from '../services/MetricsService';
import { COIValidationService } from '../services/COIValidationService';
import { config } from '../config/config';
import {
    AuthenticatedRequest,
    UserAttributes,
    ResourceAttributes,
    COIAccess
} from '../types';

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
    private readonly coiValidation: COIValidationService;
    private readonly redis: Redis;
    private publicKey: string | null = null;

    private constructor() {
        this.opaService = OPAService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.coiValidation = COIValidationService.getInstance();
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

            // Validate COI access based on partner type
            const coiValid = this.coiValidation.validateCOIAccess(
                userAttributes.coiAccess,
                this.getPartnerType(userAttributes.countryOfAffiliation)
            );

            if (!coiValid) {
                this.logger.warn('Invalid COI access detected', {
                    user: userAttributes.uniqueIdentifier,
                    country: userAttributes.countryOfAffiliation,
                    cois: userAttributes.coiAccess
                });
            }

            // Prepare resource attributes for OPA
            const resourceAttributes: ResourceAttributes = {
                path: req.path,
                method: req.method,
                classification: req.headers['x-classification'] as string,
                releasableTo: this.parseReleasability(req.headers['x-releasable-to']),
                coiTags: userAttributes.coiAccess.map(coi => coi.id),
                lacvCode: req.headers['x-lacv-code'] as string
            };

            // Evaluate access using your OPA policies
            const accessResult = await this.opaService.evaluateAccess({
                user: {
                    uniqueIdentifier: userAttributes.uniqueIdentifier,
                    countryOfAffiliation: userAttributes.countryOfAffiliation,
                    clearance: userAttributes.clearance,
                    coiTags: userAttributes.coiAccess.map(coi => coi.id),
                    caveats: userAttributes.caveats,
                    lacvCode: userAttributes.lacvCode
                },
                resource: resourceAttributes
            });

            if (!accessResult.allow) {
                throw new AuthError(
                    accessResult.error || 'Access denied',
                    403
                );
            }

            (req as AuthenticatedRequest).userAttributes = userAttributes;

            this.metrics.recordAuthSuccess(userAttributes.countryOfAffiliation);

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

    private getPartnerType(country: string): string {
        if (this.isInGroup(country, 'fvey_nations')) return 'FVEY';
        if (this.isInGroup(country, 'nato_nations')) return 'NATO';
        if (this.isInGroup(country, 'eu_nations')) return 'EU';
        return 'OTHER';
    }

    private isInGroup(country: string, group: string): boolean {
        const groups = {
            fvey_nations: ['AUS', 'CAN', 'NZL', 'GBR', 'USA'],
            nato_nations: ['USA', 'GBR', 'FRA', 'DEU', /* ... other NATO nations */],
            eu_nations: ['FRA', 'DEU', 'ITA', 'ESP', 'BEL', 'NLD']
        };
        return groups[group]?.includes(country) || false;
    }

    private parseReleasability(header: any): string[] {
        if (!header) return [];
        return Array.isArray(header) ? header : header.split(',').map(s => s.trim());
    }

    private mapKeycloakAttributes(decodedToken: any): UserAttributes {
        return {
            uniqueIdentifier: decodedToken.sub,
            countryOfAffiliation: decodedToken.country,
            clearance: decodedToken.clearance_level,
            coiAccess: this.mapCOIAccess(decodedToken.coi_access || []),
            caveats: decodedToken.caveats || [],
            lacvCode: decodedToken.lacv_code,
            metadata: {
                lastLogin: new Date(),
                federationId: decodedToken.federation_id
            }
        };
    }

    private mapCOIAccess(coiData: any[]): COIAccess[] {
        return coiData.map(coi => ({
            id: coi.id,
            name: coi.name,
            level: coi.level,
            validFrom: new Date(coi.valid_from),
            validTo: coi.valid_to ? new Date(coi.valid_to) : undefined
        }));
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