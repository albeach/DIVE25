// src/services/OPAService.ts

import axios from 'axios';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';

export interface UserAttributes {
    uniqueIdentifier: string;
    countryOfAffiliation: string;
    clearance: string;
    coiTags?: string[];
    lacvCode?: string;
}

export interface ResourceAttributes {
    clearance: string;
    releasableTo: string[];
    coiTags?: string[];
    lacvCode?: string;
}

export interface OPAInput {
    user: UserAttributes;
    resource: ResourceAttributes;
}

export interface OPAResult {
    allow: boolean;
    reason?: string;
}

export class OPAService {
    private static instance: OPAService;
    private logger: LoggerService;

    private constructor() {
        this.logger = LoggerService.getInstance();
    }

    public static getInstance(): OPAService {
        if (!OPAService.instance) {
            OPAService.instance = new OPAService();
        }
        return OPAService.instance;
    }

    async evaluateAccess(
        user: UserAttributes,
        resource: ResourceAttributes
    ): Promise<OPAResult> {
        try {
            const input: OPAInput = { user, resource };
            const response = await axios.post(config.opa.url, { input });

            if (!response.data.result) {
                return {
                    allow: false,
                    reason: 'Policy evaluation failed'
                };
            }

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };
        } catch (error) {
            this.logger.error('OPA evaluation error:', error);
            return {
                allow: false,
                reason: 'Policy evaluation error'
            };
        }
    }

    async validateAttributes(attributes: UserAttributes): Promise<{
        valid: boolean;
        missingAttributes?: string[];
    }> {
        try {
            const response = await axios.post(`${config.opa.url}/validate_attributes`, {
                input: { user: attributes }
            });

            return {
                valid: response.data.result.valid === true,
                missingAttributes: response.data.result.missing_attrs
            };
        } catch (error) {
            this.logger.error('Attribute validation error:', error);
            return {
                valid: false,
                missingAttributes: []
            };
        }
    }

    async evaluateClearanceAccess(
        userClearance: string,
        requiredClearance: string
    ): Promise<OPAResult> {
        try {
            const response = await axios.post(`${config.opa.url}/clearance`, {
                input: {
                    userClearance,
                    requiredClearance
                }
            });

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };
        } catch (error) {
            this.logger.error('Clearance evaluation error:', error);
            return {
                allow: false,
                reason: 'Clearance evaluation error'
            };
        }
    }

    async evaluateUpdateAccess(
        userAttributes: UserAttributes,
        document: Document
    ): Promise<OPAResult> {
        try {
            const response = await axios.post(`${config.opa.url}/document_update`, {
                input: {
                    user: userAttributes,
                    document
                }
            });

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };
        } catch (error) {
            this.logger.error('Update access evaluation error:', error);
            return {
                allow: false,
                reason: 'Update access evaluation error'
            };
        }
    }

    async evaluatePartnerAccess(
        userAttributes: UserAttributes,
        partnerAttributes: any
    ): Promise<OPAResult> {
        try {
            const response = await axios.post(`${config.opa.url}/partner_access`, {
                input: {
                    user: userAttributes,
                    partner: partnerAttributes
                }
            });

            return {
                allow: response.data.result.allow === true,
                reason: response.data.result.reason
            };
        } catch (error) {
            this.logger.error('Partner access evaluation error:', error);
            return {
                allow: false,
                reason: 'Partner access evaluation error'
            };
        }
    }
}

export default OPAService;