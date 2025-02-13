import axios from 'axios';
import { config } from '../config/config';

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

export class OPAService {
  private static instance: OPAService;

  private constructor() {}

  public static getInstance(): OPAService {
    if (!OPAService.instance) {
      OPAService.instance = new OPAService();
    }
    return OPAService.instance;
  }

  async evaluateAccess(user: UserAttributes, resource: ResourceAttributes): Promise<{
    allow: boolean;
    reason?: string;
  }> {
    try {
      const input: OPAInput = {
        user,
        resource
      };

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
      console.error('OPA evaluation error:', error);
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
      console.error('Attribute validation error:', error);
      return {
        valid: false,
        missingAttributes: []
      };
    }
  }
}