// src/services/FederationPartnerService.ts

import axios from 'axios';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';

export interface PartnerConfig {
    partnerId: string;
    partnerName: string;
    federationType: 'SAML' | 'OIDC';
    metadata: {
        url?: string;
        content?: string;
    };
    attributeMapping: {
        [key: string]: string;
    };
    contactInfo: {
        technical: {
            name: string;
            email: string;
        };
        administrative: {
            name: string;
            email: string;
        };
    };
}

export interface Partner extends PartnerConfig {
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    oauthClientId: string;
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
    lastModifiedBy?: string;
    deactivatedAt?: Date;
    deactivatedBy?: string;
    deactivationReason?: string;
}

export class FederationPartnerService {
    private static instance: FederationPartnerService;
    private logger: LoggerService;
    private baseUrl: string;
    private adminApiToken: string;

    private constructor() {
        if (!config.pingFederate?.apiUrl || !config.pingFederate?.adminApiToken) {
            throw new Error('Missing required PingFederate configuration');
        }
        this.baseUrl = config.pingFederate.apiUrl;
        this.adminApiToken = config.pingFederate.adminApiToken;
        this.logger = LoggerService.getInstance();
    }

    public static getInstance(): FederationPartnerService {
        if (!FederationPartnerService.instance) {
            FederationPartnerService.instance = new FederationPartnerService();
        }
        return FederationPartnerService.instance;
    }

    async onboardPartner(partnerConfig: PartnerConfig & { oauthClientId: string }): Promise<Partner> {
        try {
            // Create connection
            const connection = await this.createPartnerConnection(partnerConfig);
            
            // Configure attribute mapping
            await this.configureAttributeMapping(connection.id, partnerConfig.attributeMapping);
            
            // Enable connection
            await this.enableConnection(connection.id);

            return connection;
        } catch (error) {
            this.logger.error('Error onboarding partner:', error);
            throw error;
        }
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

    private async createPartnerConnection(config: PartnerConfig): Promise<any> {
        const connectionConfig = this.buildConnectionConfig(config);
        const response = await axios.post(
            `${this.baseUrl}/idp/connections`,
            connectionConfig,
            this.getRequestConfig()
        );
        return response.data;
    }

    private async configureAttributeMapping(
        connectionId: string,
        mapping: any
    ): Promise<void> {
        await axios.put(
            `${this.baseUrl}/idp/connections/${connectionId}/attributes`,
            {
                attributeContractFulfillment: this.buildAttributeMapping(mapping)
            },
            this.getRequestConfig()
        );
    }

    private async enableConnection(connectionId: string): Promise<void> {
        await axios.put(
            `${this.baseUrl}/idp/connections/${connectionId}/status`,
            {
                status: 'ACTIVE'
            },
            this.getRequestConfig()
        );
    }

    private buildConnectionConfig(config: PartnerConfig): any {
        if (config.federationType === 'SAML') {
            return {
                type: 'SAML20',
                name: config.partnerName,
                entityId: `urn:${config.partnerId}`,
                metadata: config.metadata,
                credentials: {
                    signingSettings: {
                        signingKeyPairRef: {
                            id: 'default'
                        }
                    }
                },
                contactInfo: config.contactInfo
            };
        } else {
            return {
                type: 'OIDC',
                name: config.partnerName,
                issuer: config.metadata.url,
                authorizeEndpoint: `${config.metadata.url}/authorize`,
                tokenEndpoint: `${config.metadata.url}/token`,
                userInfoEndpoint: `${config.metadata.url}/userinfo`,
                contactInfo: config.contactInfo
            };
        }
    }

    private buildAttributeMapping(mapping: any): any {
        const attributeMapping: any = {};
        for (const [key, value] of Object.entries(mapping)) {
            attributeMapping[key] = {
                source: {
                    type: 'ASSERTION',
                    attributeName: value
                }
            };
        }
        return attributeMapping;
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

export default FederationPartnerService;