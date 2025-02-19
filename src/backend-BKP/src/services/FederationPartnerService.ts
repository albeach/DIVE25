// src/services/FederationPartnerService.ts
import axios, { AxiosInstance } from 'axios';
import { Redis } from 'ioredis';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { MetadataValidationService } from './MetadataValidationService';
import { PartnerConfig, Partner, FederationPartner, ValidationResult, AuthError } from '../types';

export class FederationPartnerService {
    private static instance: FederationPartnerService;
    private readonly baseUrl: string;
    private readonly adminApiToken: string;
    private readonly axios: AxiosInstance;
    private readonly redis: Redis;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly metadataValidator: MetadataValidationService;

    private readonly CACHE_TTL = 3600; // 1 hour
    private readonly RETRY_ATTEMPTS = 3;
    private readonly PARTNER_STATUS_KEY = 'partner:status:';

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.metadataValidator = MetadataValidationService.getInstance();
        this.baseUrl = config.pingFederate.baseUrl;
        this.adminApiToken = config.pingFederate.adminApiToken;
        if (!this.adminApiToken) {
            throw new Error('PingFederate admin API token not configured');
        }

        // Initialize Redis with connection pooling
        this.redis = new Redis({
            ...config.redis,
            maxRetriesPerRequest: this.RETRY_ATTEMPTS,
            enableReadyCheck: true,
            connectTimeout: 10000,
            retryStrategy: (times: number) => {
                return Math.min(times * 50, 2000);
            }
        });

        // Initialize axios with defaults
        this.axios = axios.create({
            baseURL: config.pingFederate.baseUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.pingFederate.adminApiToken}`
            }
        });

        this.initializeErrorHandling();
    }

    public static getInstance(): FederationPartnerService {
        if (!FederationPartnerService.instance) {
            FederationPartnerService.instance = new FederationPartnerService();
        }
        return FederationPartnerService.instance;
    }

    private initializeErrorHandling(): void {
        this.redis.on('error', (error) => {
            this.logger.error('Redis connection error:', error);
            this.metrics.recordOperationError('redis_connection', error);
        });

        this.axios.interceptors.response.use(
            response => response,
            error => this.handleAxiosError(error)
        );
    }

    public async onboardPartner(partnerConfig: PartnerConfig): Promise<FederationPartner> {
        try {
            const validationResult = await this.validatePartnerConfig(partnerConfig);
            if (!validationResult.valid) {
                throw new Error(`Invalid partner configuration: ${validationResult.errors.join(', ')}`);
            }

            const metadataValidation = await this.metadataValidator.validateMetadata(
                partnerConfig.metadata.url || ''
            );
            if (!metadataValidation.valid) {
                throw new Error(`Invalid metadata: ${metadataValidation.errors.join(', ')}`);
            }

            const partner = await this.createPartnerConnection(partnerConfig);
            await this.cachePartnerStatus(partner);

            this.metrics.recordOperationMetrics('partner_onboarding', {
                partnerId: partner.partnerId,
                status: 'success'
            });

            return partner;
        } catch (error) {
            this.logger.error('Partner onboarding failed:', error);
            this.metrics.recordOperationMetrics('partner_onboarding', {
                partnerId: partnerConfig.partnerId,
                status: 'failed',
                error: error.message
            });
            throw this.createFederationError(error);
        }
    }

    private async validatePartnerConfig(config: PartnerConfig): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const requiredFields = ['partnerId', 'partnerName', 'federationType', 'metadata'];
        for (const field of requiredFields) {
            if (!(field in config)) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        if (config.federationType && !['SAML', 'OIDC'].includes(config.federationType)) {
            errors.push('Invalid federation type. Must be either SAML or OIDC');
        }

        if (!config.metadata.url && !config.metadata.content) {
            errors.push('Either metadata URL or content must be provided');
        }

        if (!config.attributeMapping || Object.keys(config.attributeMapping).length === 0) {
            errors.push('Attribute mapping is required');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    private async createPartnerConnection(config: PartnerConfig): Promise<FederationPartner> {
        try {
            const response = await this.axios.post('/idp/partners', {
                partnerId: config.partnerId,
                partnerName: config.partnerName,
                federationType: config.federationType,
                metadata: config.metadata,
                attributeMapping: config.attributeMapping,
                status: 'ACTIVE',
                createdAt: new Date(),
                lastModified: new Date()
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to create partner connection: ${error.message}`);
        }
    }

    private async cachePartnerStatus(partner: FederationPartner): Promise<void> {
        const key = `${this.PARTNER_STATUS_KEY}${partner.partnerId}`;
        await this.redis.setex(key, this.CACHE_TTL, JSON.stringify({
            status: partner.status,
            lastChecked: new Date(),
            metadata: partner.metadata
        }));
    }

    private handleAxiosError(error: any): never {
        const status = error.response?.status || 500;
        const message = error.response?.data?.message || error.message;

        this.logger.error('HTTP request failed:', {
            status,
            message,
            url: error.config?.url
        });

        throw this.createFederationError({
            message,
            status,
            code: `FEDERATION_${status}`
        });
    }

    private createFederationError(error: any): AuthError {
        const federationError = new Error(error.message) as AuthError;
        federationError.statusCode = error.status || 500;
        federationError.code = error.code || 'FEDERATION_ERROR';
        federationError.details = error.details || {};
        return federationError;
    }

    async getPartner(partnerId: string): Promise<Partner | null> {
        try {
            const response = await axios.get(
                `${this.baseUrl}/idp/connections/${partnerId}`,
                this.getRequestConfig()
            );
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    async updatePartner(
        partnerId: string,
        update: Partial<Partner> & { lastModifiedBy: string }
    ): Promise<Partner> {
        try {
            const response = await axios.put(
                `${this.baseUrl}/idp/connections/${partnerId}`,
                {
                    ...update,
                    lastModified: new Date()
                },
                this.getRequestConfig()
            );
            return response.data;
        } catch (error) {
            this.logger.error('Error updating partner:', error);
            throw error;
        }
    }

    async deactivatePartner(
        partnerId: string,
        deactivationInfo: { reason: string; deactivatedBy: string }
    ): Promise<void> {
        try {
            await axios.post(
                `${this.baseUrl}/idp/connections/${partnerId}/deactivate`,
                {
                    deactivationReason: deactivationInfo.reason,
                    deactivatedBy: deactivationInfo.deactivatedBy,
                    deactivatedAt: new Date()
                },
                this.getRequestConfig()
            );
        } catch (error) {
            this.logger.error('Error deactivating partner:', error);
            throw error;
        }
    }

    async validatePartnerStatus(partnerId: string): Promise<{
        canReactivate: boolean;
        reasons?: string[];
    }> {
        try {
            const response = await axios.get(
                `${this.baseUrl}/idp/connections/${partnerId}/status`,
                this.getRequestConfig()
            );
            return response.data;
        } catch (error) {
            this.logger.error('Error validating partner status:', error);
            throw error;
        }
    }

    async reactivatePartner(
        partnerId: string,
        reactivationInfo: { reactivatedBy: string }
    ): Promise<void> {
        try {
            await axios.post(
                `${this.baseUrl}/idp/connections/${partnerId}/reactivate`,
                {
                    reactivatedBy: reactivationInfo.reactivatedBy,
                    reactivatedAt: new Date()
                },
                this.getRequestConfig()
            );
        } catch (error) {
            this.logger.error('Error reactivating partner:', error);
            throw error;
        }
    }

    private getRequestConfig() {
        return {
            headers: {
                'Authorization': `Bearer ${this.adminApiToken}`,
                'Content-Type': 'application/json'
            }
        };
    }
}

export default FederationPartnerService.getInstance();