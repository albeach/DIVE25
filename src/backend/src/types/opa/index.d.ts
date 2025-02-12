// src/types/opa/index.d.ts
export interface OPAInput {
    user: {
        uniqueIdentifier: string;
        countryOfAffiliation: string;
        clearance: string;
        coiTags?: string[];
        lacvCode?: string;
    };
    resource: {
        clearance: string;
        releasableTo?: string[];
        coiTags?: string[];
        lacvCode?: string;
    };
    action?: string;
}

export interface OPAResult {
    allow: boolean;
    reason?: string;
}