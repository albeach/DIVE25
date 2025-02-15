// src/services/OPAService.ts

import axios from 'axios';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { 
    UserAttributes, 
    ResourceAttributes,
    OPAInput,
    OPAResult,
    ValidationResult,
    NATODocument,
    ClearanceLevel
} from '../types';

export class OPAService {
    private static instance: OPAService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly redis: Redis;
    private readonly policyCache: Map<string, any>;
    private readonly cacheTTL = 300; // 5 minutes

    // Security level mappings
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
        this.redis = new Redis(config.redis);
        this.policyCache = new Map();
        this.initializeService();
    }

    public static getInstance(): OPAService {
        if (!OPAService.instance) {
            OPAService.instance = new OPAService();
        }
        return OPAService.instance;
    }

    private async initializeService(): Promise<void> {
        try {
            // Verify OPA connection
            await this.checkOPAConnection();
            
            // Load initial policies
            await this.loadPolicies();
            
            // Set up policy refresh interval
            setInterval(() => this.loadPolicies(), 60000);
            
            this.logger.info('OPA service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize OPA service:', error);
            throw error;
        }
    }

    private async checkOPAConnection(): Promise<void> {
        try {
            await axios.get(`${config.opa.url}/health`);
        } catch (error) {
            throw new Error('Unable to connect to OPA server');
        }
    }

    private async loadPolicies(): Promise<void> {
        try {
            const response = await axios.get(`${config.opa.url}/policies`);
            this.policyCache.clear();
            for (const policy of response.data.result) {
                this.policyCache.set(policy.id, policy);
            }
        } catch (error) {
            this.logger.error('Failed to load OPA policies:', error);
            throw error;
        }
    }

    public async evaluateAccess(
        user: UserAttributes,
        resource: ResourceAttributes,
        action: string = 'read'
    ): Promise<OPAResult> {
        const startTime = Date.now();
        
        try {
            // Check cache first
            const cacheKey = this.generateCacheKey(user, resource, action);
            const cachedResult = await this.redis.get(cacheKey);
            
            if (cachedResult) {
                return JSON.parse(cachedResult);
            }

            // Prepare input for OPA
            const input: OPAInput = {
                user,
                resource,
                action,
                context: {
                    timestamp: new Date().toISOString(),
                    environment: config.env
                }
            };

            // Evaluate against OPA
            const response = await axios.post(
                `${config.opa.url}/v1/data/nato/abac/allow`,
                { input }
            );

            const result: OPAResult = {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };

            // Cache result
            await this.redis.setex(
                cacheKey,
                this.cacheTTL,
                JSON.stringify(result)
            );

            // Record metrics
            this.metrics.recordPolicyEvaluation({
                duration: Date.now() - startTime,
                allowed: result.allow,
                clearance: user.clearance,
                action
            });

            return result;

        } catch (error) {
            this.logger.error('Policy evaluation failed:', error);
            this.metrics.recordPolicyError(error);
            
            // Fail closed on errors
            return {
                allow: false,
                reason: 'Policy evaluation error'
            };
        }
    }

    public async evaluateClearanceAccess(
        userClearance: ClearanceLevel,
        requiredClearance: ClearanceLevel
    ): Promise<OPAResult> {
        const userLevel = this.CLEARANCE_LEVELS[userClearance];
        const requiredLevel = this.CLEARANCE_LEVELS[requiredClearance];

        if (userLevel === undefined || requiredLevel === undefined) {
            return {
                allow: false,
                reason: 'Invalid clearance level'
            };
        }

        return {
            allow: userLevel >= requiredLevel,
            reason: userLevel >= requiredLevel ? 
                'Sufficient clearance' : 
                'Insufficient clearance'
        };
    }

    public async validateAttributes(
        attributes: UserAttributes
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate required attributes
        if (!attributes.uniqueIdentifier) {
            errors.push('Missing unique identifier');
        }

        if (!attributes.clearance) {
            errors.push('Missing clearance level');
        } else if (!this.CLEARANCE_LEVELS[attributes.clearance]) {
            errors.push('Invalid clearance level');
        }

        if (!attributes.countryOfAffiliation) {
            errors.push('Missing country of affiliation');
        }

        // Validate COI tags
        if (attributes.coiTags) {
            const invalidTags = attributes.coiTags.filter(
                tag => !this.isValidCoiTag(tag)
            );
            if (invalidTags.length > 0) {
                errors.push(`Invalid COI tags: ${invalidTags.join(', ')}`);
            }
        }

        // Validate LACV code
        if (attributes.lacvCode && !this.isValidLacvCode(attributes.lacvCode)) {
            errors.push('Invalid LACV code');
        }

        // Additional validations for high clearance levels
        if (attributes.clearance === 'COSMIC TOP SECRET') {
            if (!attributes.lacvCode) {
                warnings.push('LACV code recommended for COSMIC TOP SECRET clearance');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    public async evaluateUpdateAccess(
        userAttributes: UserAttributes,
        document: NATODocument
    ): Promise<OPAResult> {
        // Special handling for document updates
        const input = {
            user: userAttributes,
            resource: {
                clearance: document.clearance,
                releasableTo: document.releasableTo,
                coiTags: document.coiTags,
                lacvCode: document.lacvCode
            },
            action: 'update',
            context: {
                originalDocument: document,
                timestamp: new Date().toISOString()
            }
        };

        const response = await axios.post(
            `${config.opa.url}/v1/data/nato/abac/allow_update`,
            { input }
        );

        return {
            allow: response.data.result.allow === true,
            reason: response.data.result.reason
        };
    }

    private generateCacheKey(
        user: UserAttributes,
        resource: ResourceAttributes,
        action: string
    ): string {
        return `opa:${user.uniqueIdentifier}:${
            resource.clearance
        }:${action}:${Date.now() - (Date.now() % 300000)}`; // 5-minute buckets
    }

    private isValidCoiTag(tag: string): boolean {
        const validTags = [
            'OpAlpha',
            'OpBravo',
            'OpGamma',
            'MissionX',
            'MissionZ'
        ];
        return validTags.includes(tag);
    }

    private isValidLacvCode(code: string): boolean {
        const validCodes = [
            'LACV001',
            'LACV002',
            'LACV003',
            'LACV004'
        ];
        return validCodes.includes(code);
    }

    public async evaluateBulkAccess(
        user: UserAttributes,
        resources: ResourceAttributes[]
    ): Promise<Map<string, OPAResult>> {
        const results = new Map<string, OPAResult>();
        
        await Promise.all(
            resources.map(async (resource) => {
                const result = await this.evaluateAccess(user, resource);
                results.set(resource.clearance, result);
            })
        );

        return results;
    }
}

export default OPAService.getInstance();