import axios from 'axios';
import { config } from '../config/config';

export interface PingFederateUserInfo {
  sub: string;
  uniqueIdentifier: string;
  countryOfAffiliation: string;
  clearance: string;
  coiTags?: string[];
  lacvCode?: string;
  organizationalAffiliation?: string;
}

export class PingFederateService {
  private static instance: PingFederateService;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;

  private constructor() {
    this.baseUrl = config.pingFederate.baseUrl;
    this.clientId = config.pingFederate.clientId;
    this.clientSecret = config.pingFederate.clientSecret;
  }

  public static getInstance(): PingFederateService {
    if (!PingFederateService.instance) {
      PingFederateService.instance = new PingFederateService();
    }
    return PingFederateService.instance;
  }

  async validateToken(accessToken: string): Promise<PingFederateUserInfo> {
    try {
      const response = await axios.get(`${this.baseUrl}/as/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return this.normalizeUserInfo(response.data);
    } catch (error) {
      console.error('Token validation error:', error);
      throw new Error('Invalid token');
    }
  }

  private normalizeUserInfo(rawUserInfo: any): PingFederateUserInfo {
    // Map PingFederate attributes to our normalized format
    return {
      sub: rawUserInfo.sub,
      uniqueIdentifier: rawUserInfo.uid || rawUserInfo.sub,
      countryOfAffiliation: rawUserInfo.country || rawUserInfo.countryCode,
      clearance: this.normalizeClassification(rawUserInfo.clearance),
      coiTags: this.parseCoiTags(rawUserInfo.coiTags),
      lacvCode: rawUserInfo.lacvCode,
      organizationalAffiliation: rawUserInfo.org
    };
  }

  private normalizeClassification(clearance: string): string {
    // Normalize different classification formats to our standard
    const normalizedMap: { [key: string]: string } = {
      'NU': 'UNCLASSIFIED',
      'NR': 'RESTRICTED',
      'NC': 'NATO CONFIDENTIAL',
      'NS': 'NATO SECRET',
      'CTS': 'COSMIC TOP SECRET',
      // Add more mappings as needed
    };

    return normalizedMap[clearance] || clearance;
  }

  private parseCoiTags(coiTags: string | string[]): string[] {
    if (!coiTags) return [];
    if (Array.isArray(coiTags)) return coiTags;
    return coiTags.split(',').map(tag => tag.trim());
  }
}