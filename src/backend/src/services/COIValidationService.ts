import { COIAccess } from '../types';

export class COIValidationService {
    private static instance: COIValidationService;

    // Valid COI tags from your OPA policy
    private readonly validCoiTags = {
        "OpAlpha": true,
        "OpBravo": true,
        "OpGamma": true,
        "MissionX": true,
        "MissionZ": true
    };

    private constructor() { }

    public validateCOIAccess(coiAccess: COIAccess[], partnerType: string): boolean {
        // Use partner-specific COI rules from your partner_policies.rego
        const allowedTags = this.getAllowedCoiTags(partnerType);

        return coiAccess.every(coi => {
            // Verify the COI tag is valid according to your policy
            if (!this.validCoiTags[coi.id]) {
                return false;
            }

            // Check if this COI is allowed for the partner type
            if (!allowedTags.includes(coi.id)) {
                return false;
            }

            return true;
        });
    }

    private getAllowedCoiTags(partnerType: string): string[] {
        // Match your partner_policies.rego definitions
        switch (partnerType) {
            case 'FVEY':
                return ['OpAlpha', 'OpBravo'];
            case 'NATO':
                return ['OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'];
            case 'EU':
                return ['MissionX'];
            default:
                return [];
        }
    }

    public static getInstance(): COIValidationService {
        if (!COIValidationService.instance) {
            COIValidationService.instance = new COIValidationService();
        }
        return COIValidationService.instance;
    }
} 