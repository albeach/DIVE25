declare module '@prisma/client' {
    export interface Partner {
        id: string;
        name: string;
        country: string;
        status: PartnerStatus;
        clearanceLevel: string;
        // Add other required fields
    }

    export enum PartnerStatus {
        PENDING = 'PENDING',
        ACTIVE = 'ACTIVE',
        INACTIVE = 'INACTIVE'
    }
}