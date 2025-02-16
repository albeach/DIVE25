// src/services/OPAService.ts

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import {
    UserAttributes,
    ResourceAttributes,
    OPAResult,
    ValidationResult,
    NATODocument,
    ClearanceLevel
} from '../types';

export interface OPAService {
    evaluateAccess(user: UserAttributes, resource: ResourceAttributes, action?: string): Promise<OPAResult>;
    validateAttributes(attributes: UserAttributes): Promise<ValidationResult>;
    evaluateClearanceAccess(userClearance: ClearanceLevel, requiredClearance: ClearanceLevel): Promise<OPAResult>;
    evaluateUpdateAccess(userAttributes: UserAttributes, document: NATODocument): Promise<OPAResult>;
    evaluateClearanceModification(userAttributes: UserAttributes, from: ClearanceLevel, to: ClearanceLevel): Promise<OPAResult>;
    evaluateReleasabilityModification(userAttributes: UserAttributes, marker: string): Promise<OPAResult>;
    evaluateCoiModification(userAttributes: UserAttributes, changes: any): Promise<OPAResult>;
}

export class OPAService {
    private static instance: OPAService;
    private readonly axios: AxiosInstance;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private readonly CACHE_CONFIG = {
        POLICY_TTL: 300, // 5 minutes
        RETRY_ATTEMPTS: 3,
        TIMEOUT: 5000 // 5 seconds
    };

    private readonly CLEARANCE_LEVELS: Record<ClearanceLevel, number> = {
        'UNCLASSIFIED': 0,
        'RESTRICTED': 1,
        'NATO CONFIDENTIAL': 2,
        'NATO SECRET': 3,
        'COSMIC TOP SECRET': 4
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();

        this.axios = axios.create({
            baseURL: config.opa.url,
            timeout: this.CACHE_CONFIG.TIMEOUT,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.initializeErrorHandling();
    }

    private initializeErrorHandling(): void {
        this.axios.interceptors.response.use(
            response => response,
            error => this.handleAxiosError(error)
        );
    }

    public static getInstance(): OPAService {
        if (!OPAService.instance) {
            OPAService.instance = new OPAService();
        }
        return OPAService.instance;
    }

    public async evaluateAccess(
        user: UserAttributes,
        resource: ResourceAttributes,
        action?: string
    ): Promise<OPAResult> {
        const startTime = Date.now();

        try {
            const response = await this.axios.post('/v1/data/dive25/abac', {
                input: {
                    user,
                    resource,
                    action
                }
            });

            const result = response.data.result;

            await this.metrics.recordOperationMetrics('opa_evaluation', {
                duration: Date.now() - startTime,
                decision: result.allow,
                userClearance: user.clearance,
                resourceClearance: resource.clearance
            });

            return {
                allow: result.allow === true,
                reason: result.reason
            };

        } catch (error) {
            this.logger.error('OPA evaluation error:', error);
            await this.metrics.recordOperationError('opa_evaluation', error);

            return {
                allow: false,
                reason: 'Policy evaluation error'
            };
        }
    }

    public async validateAttributes(
        attributes: UserAttributes
    ): Promise<ValidationResult> {
        try {
            const response = await this.axios.post('/v1/data/dive25/attribute_validation', {
                input: { attributes }
            });

            const result = response.data.result;
            return {
                valid: result.valid === true,
                errors: result.errors || [],
                warnings: result.warnings || [],
                missingAttributes: result.missing_attrs
            };

        } catch (error) {
            this.logger.error('Attribute validation error:', error);
            return {
                valid: false,
                errors: ['Attribute validation failed'],
                missingAttributes: []
            };
        }
    }

    public async evaluateClearanceAccess(
        userClearance: ClearanceLevel,
        requiredClearance: ClearanceLevel
    ): Promise<OPAResult> {
        try {
            const userLevel = this.CLEARANCE_LEVELS[userClearance];
            const requiredLevel = this.CLEARANCE_LEVELS[requiredClearance];

            const hasAccess = userLevel >= requiredLevel;

            return {
                allow: hasAccess,
                reason: hasAccess ? undefined :
                    `Insufficient clearance level: requires ${requiredClearance}`
            };

        } catch (error) {
            this.logger.error('Clearance evaluation error:', error);
            return {
                allow: false,
                reason: 'Clearance evaluation error'
            };
        }
    }

    public async evaluateUpdateAccess(
        userAttributes: UserAttributes,
        document: NATODocument
    ): Promise<OPAResult> {
        try {
            const response = await this.axios.post('/v1/data/dive25/document_update', {
                input: {
                    user: userAttributes,
                    document
                }
            });

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };

        } catch (error) {
            this.logger.error('Update access evaluation error:', error);
            return {
                allow: false,
                reason: 'Update access evaluation error'
            };
        }
    }

    public async validateConnection(): Promise<boolean> {
        try {
            await this.axios.get('/health');
            return true;
        } catch (error) {
            this.logger.error('OPA connection failed:', error);
            throw new Error('Failed to connect to OPA');
        }
    }

    public async evaluateClearanceModification(
        userAttributes: UserAttributes,
        from: ClearanceLevel,
        to: ClearanceLevel
    ): Promise<OPAResult> {
        try {
            const response = await this.axios.post('/v1/data/dive25/clearance_modification', {
                input: {
                    user: userAttributes,
                    from,
                    to
                }
            });

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };

        } catch (error) {
            this.logger.error('Clearance modification evaluation error:', error);
            return {
                allow: false,
                reason: 'Clearance modification evaluation error'
            };
        }
    }

    public async evaluateReleasabilityModification(
        userAttributes: UserAttributes,
        marker: string
    ): Promise<OPAResult> {
        try {
            const response = await this.axios.post('/v1/data/dive25/releasability_modification', {
                input: {
                    user: userAttributes,
                    marker
                }
            });

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };

        } catch (error) {
            this.logger.error('Releasability modification evaluation error:', error);
            return {
                allow: false,
                reason: 'Releasability modification evaluation error'
            };
        }
    }

    private handleAxiosError(error: any): never {
        this.logger.error('OPA request failed:', error);

        throw {
            message: error.response?.data?.message || error.message,
            status: error.response?.status || 500,
            code: 'OPA_ERROR'
        };
    }
}

export default OPAService.getInstance();