declare namespace Express {
    export interface Request {
        userAttributes?: {
            uniqueIdentifier: string;
            countryOfAffiliation: string;
            clearance: string;
            coiTags?: string[];
            lacvCode?: string;
            organizationalAffiliation?: string;
        };
        document?: any;
    }
}