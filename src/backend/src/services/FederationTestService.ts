import { Partner } from '@prisma/client';
import axios from 'axios';
import { sign, verify } from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { Metrics } from './metricsService';

interface TestResult {
    success: boolean;
    stage: string;
    duration: number;
    error?: string;
    details?: any;
}

export class FederationTestService {
    private metrics: Metrics;

    constructor() {
        this.metrics = new Metrics();
    }

    async testFederation(partner: Partner): Promise<TestResult[]> {
        const results: TestResult[] = [];

        try {
            // Test metadata endpoints
            results.push(await this.testMetadataEndpoint(partner));

            // Test authentication flow
            results.push(await this.testAuthFlow(partner));

            // Test attribute mapping
            results.push(await this.testAttributeMapping(partner));

            // Test token validation
            results.push(await this.testTokenValidation(partner));

            // Record metrics
            this.recordTestMetrics(partner.id, results);

            return results;
        } catch (error) {
            logger.error(`Federation test failed for partner ${partner.name}:`, error);
            throw error;
        }
    }

    private async testMetadataEndpoint(partner: Partner): Promise<TestResult> {
        const startTime = Date.now();
        try {
            const response = await axios.get(
                `https://${partner.id}.dive25.com/.well-known/federation-metadata`
            );

            return {
                success: response.status === 200,
                stage: 'metadata',
                duration: Date.now() - startTime,
                details: response.data
            };
        } catch (error) {
            return {
                success: false,
                stage: 'metadata',
                duration: Date.now() - startTime,
                error: error.message
            };
        }
    }

    // ... other test methods ...

    private recordTestMetrics(partnerId: string, results: TestResult[]) {
        results.forEach(result => {
            this.metrics.recordFederationTest({
                partnerId,
                stage: result.stage,
                success: result.success,
                duration: result.duration
            });
        });
    }
} 