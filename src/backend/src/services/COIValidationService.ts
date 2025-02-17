import { COIAccess } from '../types';

export class COIValidationService {
    private static instance: COIValidationService;

    private constructor() { }

    public validateCOIAccess(coiAccess: COIAccess[]): boolean {
        const now = new Date();

        return coiAccess.every(coi => {
            // Check if COI access is currently valid
            const validFrom = new Date(coi.validFrom);
            const validTo = coi.validTo ? new Date(coi.validTo) : null;

            const isValid = validFrom <= now &&
                (!validTo || validTo >= now);

            // Additional validation rules can be added here
            const hasValidLevel = this.validateCOILevel(coi.level);

            return isValid && hasValidLevel;
        });
    }

    private validateCOILevel(level: string): boolean {
        const validLevels = ['READ', 'WRITE', 'ADMIN'];
        return validLevels.includes(level.toUpperCase());
    }

    public static getInstance(): COIValidationService {
        if (!COIValidationService.instance) {
            COIValidationService.instance = new COIValidationService();
        }
        return COIValidationService.instance;
    }
} 