// src/services/OAuthClientService.ts
import axios from 'axios';
import { config } from '../config/config';

export interface OAuthClientConfig {
  clientId: string;
  name: string;
  description?: string;
  grantTypes: string[];
  redirectUris: string[];
  restrictedScopes?: string[];
  clientAuthentication: {
    type: 'SECRET' | 'CERTIFICATE';
    secret?: string;
    certificateRef?: string;
  };
}

export class OAuthClientService {
  private static instance: OAuthClientService;
  private baseUrl: string;
  private adminApiToken: string;

  private constructor() {
    this.baseUrl = config.pingFederate.apiUrl;
    this.adminApiToken = config.pingFederate.adminApiToken;
  }

  public static getInstance(): OAuthClientService {
    if (!OAuthClientService.instance) {
      OAuthClientService.instance = new OAuthClientService();
    }
    return OAuthClientService.instance;
  }

  async createOAuthClient(clientConfig: OAuthClientConfig): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/oauth/clients`,
        clientConfig,
        {
          headers: {
            'Authorization': `Bearer ${this.adminApiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating OAuth client:', error);
      throw error;
    }
  }

  async getOAuthClient(clientId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/oauth/clients/${clientId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.adminApiToken}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting OAuth client:', error);
      throw error;
    }
  }
}