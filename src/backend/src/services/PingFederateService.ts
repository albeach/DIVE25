// src/services/PingFederateService.ts
import axios from 'axios';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { UserAttributes } from '../types';
import { asAuthError } from '../utils/errorUtils';
import { 
   ClearanceLevel,
   CoiTag,
   LacvCode,
   ValidClearanceLevels,
   ValidCoiTags,
   ValidLacvCodes 
} from '../models/Document';

export class PingFederateService {
   private static instance: PingFederateService;
   private readonly baseUrl: string;
   private readonly clientId: string;
   private readonly clientSecret: string;
   private readonly logger: LoggerService;

   private constructor() {
       if (!config.pingFederate.baseUrl || 
           !config.pingFederate.clientId || 
           !config.pingFederate.clientSecret) {
           throw new Error('PingFederate configuration is incomplete');
       }

       this.baseUrl = config.pingFederate.baseUrl;
       this.clientId = config.pingFederate.clientId;
       this.clientSecret = config.pingFederate.clientSecret;
       this.logger = LoggerService.getInstance();
   }

   public static getInstance(): PingFederateService {
       if (!PingFederateService.instance) {
           PingFederateService.instance = new PingFederateService();
       }
       return PingFederateService.instance;
   }

   async validateToken(accessToken: string): Promise<UserAttributes> {
       try {
           const response = await axios.get(`${this.baseUrl}/as/userinfo`, {
               headers: {
                   Authorization: `Bearer ${accessToken}`
               }
           });

           return this.normalizeUserInfo(response.data);
       } catch (error) {
           this.logger.error('Token validation error:', error);
           throw asAuthError(error);
       }
   }

   private normalizeUserInfo(rawUserInfo: any): UserAttributes {
       try {
           const clearance = this.normalizeClassification(rawUserInfo.clearance);
           const coiTags = this.parseCoiTags(rawUserInfo.coiTags);
           const lacvCode = this.validateLacvCode(rawUserInfo.lacvCode);

           if (!rawUserInfo.uid && !rawUserInfo.sub) {
               throw new Error('Missing required user identifier');
           }

           if (!rawUserInfo.country && !rawUserInfo.countryCode) {
               throw new Error('Missing required country affiliation');
           }

           return {
               uniqueIdentifier: rawUserInfo.uid || rawUserInfo.sub,
               countryOfAffiliation: rawUserInfo.country || rawUserInfo.countryCode,
               clearance,
               coiTags,
               lacvCode,
               organizationalAffiliation: rawUserInfo.org
           };
       } catch (error) {
           this.logger.error('User info normalization error:', error);
           throw asAuthError(error);
       }
   }

   private normalizeClassification(clearance: string): ClearanceLevel {
       const normalizedMap: Record<string, ClearanceLevel> = {
           'NU': 'UNCLASSIFIED',
           'NR': 'RESTRICTED',
           'NC': 'NATO CONFIDENTIAL',
           'NS': 'NATO SECRET',
           'CTS': 'COSMIC TOP SECRET'
       };

       const normalized = normalizedMap[clearance] || clearance;
       
       if (!this.isValidClearance(normalized)) {
           throw new Error(`Invalid clearance level: ${clearance}`);
       }

       return normalized;
   }

   private parseCoiTags(coiTags: string | string[] | undefined): CoiTag[] {
       if (!coiTags) return [];
       
       const tags = Array.isArray(coiTags) 
           ? coiTags 
           : coiTags.split(',').map(tag => tag.trim());

       const validTags = tags.filter(this.isValidCoiTag);
       
       if (tags.length !== validTags.length) {
           const invalidTags = tags.filter(tag => !this.isValidCoiTag(tag));
           this.logger.warn('Invalid COI tags detected', { invalidTags });
       }

       return validTags;
   }

   private validateLacvCode(code: string | undefined): LacvCode | undefined {
       if (!code) return undefined;

       if (!this.isValidLacvCode(code)) {
           throw new Error(`Invalid LACV code: ${code}`);
       }

       return code;
   }

   private isValidClearance(clearance: string): clearance is ClearanceLevel {
       return ValidClearanceLevels.includes(clearance as ClearanceLevel);
   }

   private isValidCoiTag(tag: string): tag is CoiTag {
       return ValidCoiTags.includes(tag as CoiTag);
   }

   private isValidLacvCode(code: string): code is LacvCode {
       return ValidLacvCodes.includes(code as LacvCode);
   }

   async introspectToken(accessToken: string): Promise<{
       active: boolean;
       exp?: number;
       scope?: string[];
       client_id?: string;
       username?: string;
   }> {
       try {
           const response = await axios.post(
               `${this.baseUrl}/as/introspect.oauth2`,
               `token=${accessToken}`,
               {
                   headers: {
                       'Content-Type': 'application/x-www-form-urlencoded',
                       'Authorization': `Basic ${this.getBasicAuthToken()}`
                   }
               }
           );

           return response.data;
       } catch (error) {
           this.logger.error('Token introspection error:', error);
           throw asAuthError(error);
       }
   }

   async revokeToken(accessToken: string): Promise<void> {
       try {
           await axios.post(
               `${this.baseUrl}/as/revoke.oauth2`,
               `token=${accessToken}`,
               {
                   headers: {
                       'Content-Type': 'application/x-www-form-urlencoded',
                       'Authorization': `Basic ${this.getBasicAuthToken()}`
                   }
               }
           );
       } catch (error) {
           this.logger.error('Token revocation error:', error);
           throw asAuthError(error);
       }
   }

   private getBasicAuthToken(): string {
       return Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
   }
}

export default PingFederateService;