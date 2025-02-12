// src/services/PingFederateService.ts
import axios from 'axios';
import { config } from '../config/config';
import { ClearanceLevel, CoiTag, UserAttributes } from '../types';

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

    async validateToken(accessToken: string): Promise<UserAttributes> {
        try {
            const response = await axios.get(`${this.baseUrl}/as/userinfo`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            return this.normalizeUserInfo(response.data);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }

    private normalizeUserInfo(rawUserInfo: any): UserAttributes {
        return {
            uniqueIdentifier: rawUserInfo.uid || rawUserInfo.sub,
            countryOfAffiliation: rawUserInfo.country || rawUserInfo.countryCode,
            clearance: this.normalizeClassification(rawUserInfo.clearance) as ClearanceLevel,
            coiTags: this.parseCoiTags(rawUserInfo.coiTags) as CoiTag[],
            lacvCode: rawUserInfo.lacvCode,
            organizationalAffiliation: rawUserInfo.org
        };
    }

    private normalizeClassification(clearance: string): string {
        const normalizedMap: { [key: string]: string } = {
            'NU': 'UNCLASSIFIED',
            'NR': 'RESTRICTED',
            'NC': 'NATO CONFIDENTIAL',
            'NS': 'NATO SECRET',
            'CTS': 'COSMIC TOP SECRET'
        };
        return normalizedMap[clearance] || clearance;
    }

    private parseCoiTags(coiTags: string | string[]): string[] {
        if (!coiTags) return [];
        if (Array.isArray(coiTags)) return coiTags;
        return coiTags.split(',').map(tag => tag.trim());
    }
}

export default PingFederateService;