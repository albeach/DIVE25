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

interface OPAInput {
    user: {
        uniqueIdentifier: string;
        countryOfAffiliation: string;
        clearance: string;
        coiTags: string[];
        caveats: string[];
        lacvCode?: string;
    };
    resource: {
        path: string;
        method: string;
        classification: string;
        releasableTo: string[];
        coiTags?: string[];
        lacvCode?: string;
    };
}

export class OPAService {
    private static instance: OPAService;
    private readonly axios: AxiosInstance;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly baseUrl: string;

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
        this.baseUrl = config.opa.url;

        this.axios = axios.create({
            baseURL: this.baseUrl,
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
        resource: ResourceAttributes
    ): Promise<OPAResult> {
        const input: OPAInput = {
            user: {
                uniqueIdentifier: user.uniqueIdentifier,
                countryOfAffiliation: user.countryOfAffiliation,
                clearance: user.clearance,
                coiTags: user.coiTags || [],
                caveats: user.caveats || [],
                lacvCode: user.lacvCode
            },
            resource: {
                path: resource.path,
                method: resource.method,
                classification: resource.classification,
                releasableTo: resource.releasableTo,
                coiTags: resource.coiTags,
                lacvCode: resource.lacvCode
            }
        };

        try {
            const response = await this.axios.post('/v1/data/nato/document/allow', { input });
            return response.data.result;
        } catch (error) {
            this.logger.error('OPA evaluation failed', { error, input });
            return {
                allow: false,
                reason: 'Access control evaluation failed'
            };
        }
    }

    private async queryPolicy(policyPath: string, input: OPAInput): Promise<OPAResult> {
        const response = await this.axios.post(
            `/v1/data/${policyPath}`,
            { input },
            {
                timeout: 5000 // 5 second timeout
            }
        );

        if (response.status !== 200) {
            throw new Error(`OPA returned status ${response.status}`);
        }

        const result = response.data.result;

        return {
            allow: result.allow === true,
            error: result.error || undefined
        };
    }

    private recordPolicyDecision(
        policy: string,
        allowed: boolean,
        input: OPAInput
    ): void {
        this.metrics.recordMetric('opa_decision', {
            policy,
            allowed: allowed ? 1 : 0,
            country: input.user.countryOfAffiliation,
            clearance: input.user.clearance,
            classification: input.resource.classification
        });

        this.logger.info('Policy decision', {
            policy,
            allowed,
            country: input.user.countryOfAffiliation,
            resource: {
                classification: input.resource.classification,
                releasableTo: input.resource.releasableTo,
                coiTags: input.resource.coiTags
            }
        });
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
                reason: 'Update access evaluation failed'
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
        user: UserAttributes,
        fromLevel: ClearanceLevel,
        toLevel: ClearanceLevel
    ): Promise<OPAResult> {
        try {
            const response = await this.axios.post('/v1/data/nato/clearance/modify', {
                input: {
                    user,
                    modification: {
                        from: fromLevel,
                        to: toLevel
                    }
                }
            });
            return response.data.result;
        } catch (error) {
            this.logger.error('Clearance modification evaluation failed', { error, user, fromLevel, toLevel });
            return {
                allow: false,
                reason: 'Clearance modification evaluation failed'
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

    public async evaluateCoiModification(userAttributes: UserAttributes, changes: any): Promise<OPAResult> {
        // Implementation needed
        throw new Error('Method not implemented');
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