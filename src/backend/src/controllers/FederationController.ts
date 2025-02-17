import { FederationTestService } from '../services/federationTestService';
import { FederationDiagnosticService } from '../services/federationDiagnosticService';
import { FederationMonitorService } from '../services/federationMonitorService';

export class FederationController {
    private testService: FederationTestService;
    private diagnosticService: FederationDiagnosticService;
    private monitorService: FederationMonitorService;

    constructor() {
        this.testService = new FederationTestService();
        this.diagnosticService = new FederationDiagnosticService();
        this.monitorService = new FederationMonitorService();
    }

    async testPartnerFederation(partnerId: string) {
        const partner = await this.getPartner(partnerId);
        return this.testService.testFederation(partner);
    }

    async troubleshootFederation(partnerId: string) {
        const partner = await this.getPartner(partnerId);
        return this.diagnosticService.generateTroubleshootingReport(partner);
    }

    async getFederationStatus(partnerId: string) {
        const partner = await this.getPartner(partnerId);
        return this.monitorService.getFederationStatus(partner);
    }
} 