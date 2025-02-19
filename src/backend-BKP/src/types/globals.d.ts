declare module '@node-saml/node-saml' {
    export class ServiceProvider {
        constructor(options: any);
        generateServiceProviderMetadata(): string;
    }
    export class IdentityProvider {
        constructor(options: any);
        metadata: any;
        validateResponse(request: any): Promise<{ profile: any }>;
    }
}

declare module '@keycloak/keycloak-admin-client' {
    export default class KeycloakAdminClient {
        constructor(config: any);
        auth(credentials: any): Promise<void>;
        identityProviders: {
            create(data: any): Promise<any>;
            createMapper(params: any, data: any): Promise<any>;
        };
    }
}

declare module 'cloudflare' {
    export class CloudflareAPI {
        constructor(config: any);
        dnsRecords: {
            create(zoneId: string, data: any): Promise<any>;
            browse(zoneId: string): Promise<any>;
            delete(zoneId: string, recordId: string): Promise<any>;
        };
    }
}