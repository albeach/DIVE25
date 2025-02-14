// src/services/OAuthClientService.ts
import axios from 'axios';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { AuthError } from '../types';
import { asAuthError } from '../middleware/errorHandler';

export interface OAuthClientConfig {
   clientId: string;
   name: string;
   description?: string;
   grantTypes: ('authorization_code' | 'client_credentials' | 'refresh_token')[];
   redirectUris: string[];
   restrictedScopes?: string[];
   clientAuthentication: {
       type: 'SECRET' | 'CERTIFICATE';
       secret?: string;
       certificateRef?: string;
   };
}

export interface OAuthClient extends OAuthClientConfig {
   id: string;
   createdAt: Date;
   lastModified: Date;
   enabled: boolean;
}

export class OAuthClientService {
   private static instance: OAuthClientService;
   private baseUrl: string;
   private adminApiToken: string;
   private logger: LoggerService;

   private constructor() {
       this.baseUrl = config.pingFederate.apiUrl;
       if (!config.pingFederate.adminApiToken) {
           throw new Error('OAuth admin API token not configured');
       }
       this.adminApiToken = config.pingFederate.adminApiToken;
       this.logger = LoggerService.getInstance();
   }

   public static getInstance(): OAuthClientService {
       if (!OAuthClientService.instance) {
           OAuthClientService.instance = new OAuthClientService();
       }
       return OAuthClientService.instance;
   }

   async createOAuthClient(clientConfig: OAuthClientConfig): Promise<OAuthClient> {
       try {
           const response = await axios.post(
               `${this.baseUrl}/oauth/clients`,
               this.validateClientConfig(clientConfig),
               this.getRequestConfig()
           );

           this.logger.info('OAuth client created', {
               clientId: clientConfig.clientId,
               name: clientConfig.name
           });

           return response.data;
       } catch (error) {
           this.logger.error('Error creating OAuth client:', error);
           throw asAuthError(error);
       }
   }

   async getOAuthClient(clientId: string): Promise<OAuthClient | null> {
       try {
           const response = await axios.get(
               `${this.baseUrl}/oauth/clients/${clientId}`,
               this.getRequestConfig()
           );
           return response.data;
       } catch (error) {
           if (axios.isAxiosError(error) && error.response?.status === 404) {
               return null;
           }
           this.logger.error('Error getting OAuth client:', error);
           throw asAuthError(error);
       }
   }

   async updateOAuthClient(clientId: string, updates: Partial<OAuthClientConfig>): Promise<OAuthClient> {
       try {
           const currentClient = await this.getOAuthClient(clientId);
           if (!currentClient) {
               throw new Error(`OAuth client ${clientId} not found`);
           }

           const updatedConfig = {
               ...currentClient,
               ...updates,
               lastModified: new Date()
           };

           const response = await axios.put(
               `${this.baseUrl}/oauth/clients/${clientId}`,
               this.validateClientConfig(updatedConfig),
               this.getRequestConfig()
           );

           this.logger.info('OAuth client updated', {
               clientId,
               updates: Object.keys(updates)
           });

           return response.data;
       } catch (error) {
           this.logger.error('Error updating OAuth client:', error);
           throw asAuthError(error);
       }
   }

   async deleteOAuthClient(clientId: string): Promise<void> {
       try {
           await axios.delete(
               `${this.baseUrl}/oauth/clients/${clientId}`,
               this.getRequestConfig()
           );

           this.logger.info('OAuth client deleted', { clientId });
       } catch (error) {
           this.logger.error('Error deleting OAuth client:', error);
           throw asAuthError(error);
       }
   }

   async rotateClientSecret(clientId: string): Promise<{ secret: string }> {
       try {
           const response = await axios.post(
               `${this.baseUrl}/oauth/clients/${clientId}/secret`,
               {},
               this.getRequestConfig()
           );

           this.logger.info('OAuth client secret rotated', { clientId });

           return response.data;
       } catch (error) {
           this.logger.error('Error rotating OAuth client secret:', error);
           throw asAuthError(error);
       }
   }

   private validateClientConfig(config: Partial<OAuthClientConfig>): OAuthClientConfig {
       const requiredFields = [
           'clientId',
           'name',
           'grantTypes',
           'redirectUris'
       ];

       for (const field of requiredFields) {
           if (!(field in config)) {
               throw new Error(`Missing required field: ${field}`);
           }
       }

       const validGrantTypes = [
           'authorization_code',
           'client_credentials',
           'refresh_token'
       ];

       if (!config.grantTypes?.every(grant => validGrantTypes.includes(grant))) {
           throw new Error('Invalid grant type specified');
       }

       if (config.clientAuthentication?.type === 'SECRET' && !config.clientAuthentication.secret) {
           throw new Error('Client secret required for SECRET authentication type');
       }

       if (config.clientAuthentication?.type === 'CERTIFICATE' && !config.clientAuthentication.certificateRef) {
           throw new Error('Certificate reference required for CERTIFICATE authentication type');
       }

       return config as OAuthClientConfig;
   }

   private getRequestConfig() {
       return {
           headers: {
               'Authorization': `Bearer ${this.adminApiToken}`,
               'Content-Type': 'application/json'
           }
       };
   }

   async listOAuthClients(options?: {
       page?: number;
       size?: number;
       filter?: string;
   }): Promise<{
       items: OAuthClient[];
       total: number;
       page: number;
       size: number;
   }> {
       try {
           const response = await axios.get(
               `${this.baseUrl}/oauth/clients`,
               {
                   ...this.getRequestConfig(),
                   params: options
               }
           );

           return response.data;
       } catch (error) {
           this.logger.error('Error listing OAuth clients:', error);
           throw asAuthError(error);
       }
   }
}

export default OAuthClientService;