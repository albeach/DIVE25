// src/services/PingFederateService.ts

import axios, { AxiosInstance } from 'axios';
import { Redis } from 'ioredis';
import { DOMParser } from 'xmldom';
import { SignedXml } from 'xml-crypto';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { SessionManagementService } from './SessionManagementService';
import {
    UserAttributes,
    ClearanceLevel,
    CoiTag,
    LacvCode,
    ValidationResult,
    AuthError
} from '../types';

interface TokenValidationResult {
    valid: boolean;
    userInfo?: UserAttributes;
    error?: string;
}

interface FederationMetadata {
    entityId: string;
    endpoints: {
        sso?: string;
        slo?: string;
        assertion?: string;
    };
    certificates: string[];
    lastUpdated: Date;
}

export class PingFederateService {
    private static instance: PingFederateService;
    private readonly axios: AxiosInstance;
    private readonly redis: Redis;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly sessionService: SessionManagementService;
    private readonly parser: DOMParser;

    private readonly CACHE_CONFIG = {
        TOKEN_TTL: 3600,
        METADATA_TTL: 86400,
        RETRY_ATTEMPTS: 3
    };

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.sessionService = SessionManagementService.getInstance();
        this.parser = new DOMParser();

        this.redis = new Redis({
            ...config.redis,
            maxRetriesPerRequest: this.CACHE_CONFIG.RETRY_ATTEMPTS
        });

        this.axios = axios.create({
            baseURL: config.pingFederate.baseUrl,
            timeout: 10000,
            headers: {
                'Authorization': `Bearer ${config.pingFederate.adminApiToken}`
            }
        });

        this.initializeErrorHandling();
    }

    public static getInstance(): PingFederateService {
        if (!PingFederateService.instance) {
            PingFederateService.instance = new PingFederateService();
        }
        return PingFederateService.instance;
    }

    private initializeErrorHandling(): void {
        this.axios.interceptors.response.use(
            response => response,
            error => this.handleAxiosError(error)
        );

        this.redis.on('error', (error) => {
            this.logger.error('Redis federation cache error:', error);
            this.metrics.recordOperationError('federation_cache', error);
        });
    }

    public async validateToken(token: string): Promise<UserAttributes> {
        const startTime = Date.now();
        try {
            // Check token cache first
            const cachedValidation = await this.getTokenValidation(token);
            if (cachedValidation) {
                return cachedValidation;
            }

            // Validate token with PingFederate
            const validation = await this.validateTokenWithPingFederate(token);

            if (!validation.valid || !validation.userInfo) {
                throw new Error(validation.error || 'Token validation failed');
            }

            // Cache validated token
            await this.cacheTokenValidation(token, validation.userInfo);

            // Record metrics
            this.metrics.recordOperationMetrics('token_validation', {
                duration: Date.now() - startTime,
                success: true
            });

            return validation.userInfo;

        } catch (error) {
            this.logger.error('Token validation error:', error);
            this.metrics.recordOperationMetrics('token_validation', {
                duration: Date.now() - startTime,
                success: false,
                error: error.message
            });
            throw this.createFederationError(error);
        }
    }

    private async validateTokenWithPingFederate(token: string): Promise<TokenValidationResult> {
        try {
            const response = await this.axios.post('/pf/oauth/validate', { token });

            if (!response.data.active) {
                return {
                    valid: false,
                    error: 'Token is inactive or expired'
                };
            }

            const userInfo = await this.getUserInfo(token);
            return {
                valid: true,
                userInfo: this.normalizeUserAttributes(userInfo)
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    private async getUserInfo(token: string): Promise<any> {
        const response = await this.axios.get('/pf/oauth/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data;
    }

    private normalizeUserAttributes(rawUserInfo: any): UserAttributes {
        return {
            uniqueIdentifier: rawUserInfo.sub || rawUserInfo.uid,
            countryOfAffiliation: rawUserInfo.country || rawUserInfo.countryCode,
            clearance: this.normalizeClearanceLevel(rawUserInfo.clearance),
            coiTags: this.normalizeCoiTags(rawUserInfo.coiTags),
            lacvCode: this.normalizeLacvCode(rawUserInfo.lacvCode),
            organizationalAffiliation: rawUserInfo.org
        };
    }

    private normalizeClearanceLevel(clearance: string): ClearanceLevel {
        const clearanceMap: { [key: string]: ClearanceLevel } = {
            'NU': 'UNCLASSIFIED',
            'NR': 'RESTRICTED',
            'NC': 'NATO CONFIDENTIAL',
            'NS': 'NATO SECRET',
            'CTS': 'COSMIC TOP SECRET'
        };
        return clearanceMap[clearance] || clearance as ClearanceLevel;
    }

    private normalizeCoiTags(tags: string | string[]): CoiTag[] {
        if (!tags) return [];
        const rawTags = Array.isArray(tags) ? tags : tags.split(',');
        return rawTags
            .map(tag => tag.trim())
            .filter(tag => this.isValidCoiTag(tag)) as CoiTag[];
    }

    private normalizeLacvCode(code: string): LacvCode | undefined {
        return this.isValidLacvCode(code) ? code as LacvCode : undefined;
    }

    private isValidCoiTag(tag: string): tag is CoiTag {
        const validTags = ['OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'];
        return validTags.includes(tag);
    }

    private isValidLacvCode(code: string): code is LacvCode {
        const validCodes = ['LACV001', 'LACV002', 'LACV003', 'LACV004'];
        return validCodes.includes(code);
    }

    private async getTokenValidation(token: string): Promise<UserAttributes | null> {
        const cached = await this.redis.get(`token:${token}`);
        return cached ? JSON.parse(cached) : null;
    }

    private async cacheTokenValidation(token: string, userInfo: UserAttributes): Promise<void> {
        await this.redis.setex(
            `token:${token}`,
            this.CACHE_CONFIG.TOKEN_TTL,
            JSON.stringify(userInfo)
        );
    }

    private createFederationError(error: any): AuthError {
        const federationError = new Error(error.message) as AuthError;
        federationError.statusCode = error.status || 500;
        federationError.code = 'FEDERATION_ERROR';
        federationError.details = error.details;
        return federationError;
    }

    private handleAxiosError(error: any): never {
        this.logger.error('PingFederate request failed:', error);
        throw {
            message: error.response?.data?.message || error.message,
            status: error.response?.status || 500,
            code: 'PINGFED_ERROR'
        };
    }
}

export default PingFederateService.getInstance();