// src/types/partner/index.d.ts

export interface PartnerConfig {
    partnerId: string;
    partnerName: string;
    federationType: 'SAML' | 'OIDC';
    metadata: {
        url?: string;
        content?: string;
    };
    attributeMapping: {
        [key: string]: string;
    };
    contactInfo: {
        technical: ContactInfo;
        administrative: ContactInfo;
    };
    oauthClientId?: string;
}

interface ContactInfo {
    name: string;
    email: string;
}

export interface OAuthClientConfig {
    clientId: string;
    name: string;
    description?: string;
    grantTypes: string[];
    redirectUris: string[];
    restrictedScopes?: string[];
    clientAuthentication: {
        type: 'SECRET' | 'CERTIFICATE';
        secret?: string;
        certificateRef?: string;
    };
}