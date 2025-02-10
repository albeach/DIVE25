// src/services/FederationPartnerService.ts
import axios from 'axios';
import { config } from '../config/config';

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

export class FederationPartnerService {
  private static instance: FederationPartnerService;
  private baseUrl: string;
  private adminApiToken: string;

  private constructor() {
    this.baseUrl = config.pingFederate.apiUrl;
    this.adminApiToken = config.pingFederate.adminApiToken;
  }

  public static getInstance(): FederationPartnerService {
    if (!FederationPartnerService.instance) {
      FederationPartnerService.instance = new FederationPartnerService();
    }
    return FederationPartnerService.instance;
  }

  async onboardPartner(partnerConfig: PartnerConfig): Promise<any> {
    try {
      // 1. Create connection
      const connection = await this.createPartnerConnection(partnerConfig);
      
      // 2. Configure attribute mapping
      await this.configureAttributeMapping(connection.id, partnerConfig.attributeMapping);
      
      // 3. Enable connection
      await this.enableConnection(connection.id);

      return connection;
    } catch (error) {
      console.error('Error onboarding partner:', error);
      throw error;
    }
  }

  private async createPartnerConnection(config: PartnerConfig): Promise<any> {
    const connectionConfig = this.buildConnectionConfig(config);
    const response = await axios.post(
      `${this.baseUrl}/idp/connections`,
      connectionConfig,
      {
        headers: {
          'Authorization': `Bearer ${this.adminApiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
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

  private async configureAttributeMapping(connectionId: string, mapping: any): Promise<void> {
    await axios.put(
      `${this.baseUrl}/idp/connections/${connectionId}/attributes`,
      {
        attributeContractFulfillment: this.buildAttributeMapping(mapping)
      },
      {
        headers: {
          'Authorization': `Bearer ${this.adminApiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
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

  private async enableConnection(connectionId: string): Promise<void> {
    await axios.put(
      `${this.baseUrl}/idp/connections/${connectionId}/status`,
      {
        status: 'ACTIVE'
      },
      {
        headers: {
          'Authorization': `Bearer ${this.adminApiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}