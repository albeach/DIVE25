// src/services/OPAService.ts

import axios from 'axios';
import { config } from '../config/config';
import { LoggerService } from './LoggerService';
import { OPAInput, OPAResult } from '../types/opa';

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

    async evaluateAccess(user: OPAInput['user'], resource: OPAInput['resource'], action?: string): Promise<OPAResult> {
        try {
            const input: OPAInput = {
                user,
                resource,
                action
            };

            const response = await axios.post<{result: OPAResult}>(config.opa.url, { input });
            
            if (!response.data.result) {
                return {
                    allow: false,
                    reason: 'Policy evaluation failed'
                };
            }

            return response.data.result;
        } catch (error) {
            this.logger.error('OPA evaluation error', { 
                error: error instanceof Error ? error.message : 'Unknown error',
                user: user.uniqueIdentifier,
                resource: resource.clearance 
            });
            
            return {
                allow: false,
                reason: 'Policy evaluation error'
            };
        }
    }
}