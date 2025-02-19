import { Partner } from '@prisma/client';
import { KeycloakFederationService } from './keycloakFederationService';
import { logger } from '../utils/logger';

interface DiagnosticResult {
    timestamp: Date;
    category: string;
    status: 'ok' | 'warning' | 'error';
    message: string;
    details?: any;
}

export class FederationDiagnosticService {
    private keycloak: KeycloakFederationService;

    constructor() {
        this.keycloak = new KeycloakFederationService();
    }

    async runDiagnostics(partner: Partner): Promise<DiagnosticResult[]> {
        const results: DiagnosticResult[] = [];

        // Check federation configuration
        results.push(await this.checkFederationConfig(partner));

        // Verify certificates
        results.push(await this.checkCertificates(partner));

        // Test network connectivity
        results.push(await this.checkConnectivity(partner));

        // Validate Keycloak configuration
        results.push(await this.checkKeycloakConfig(partner));

        // Log results
        this.logDiagnosticResults(partner, results);

        return results;
    }

    async generateTroubleshootingReport(partner: Partner): Promise<string> {
        const diagnostics = await this.runDiagnostics(partner);
        const logs = await this.getFederationLogs(partner);
        const metrics = await this.getFederationMetrics(partner);

        return this.formatReport(partner, diagnostics, logs, metrics);
    }

    // ... implementation details ...
} 