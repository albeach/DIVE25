import { Partner } from '@prisma/client';
import {
    ServiceProvider,
    IdentityProvider
} from '@node-saml/node-saml';
import {
    Client as OIDCClient,
    Issuer as OIDCIssuer
} from 'openid-client';
import { logger } from '../utils/logger';

interface FederationConfig {
    protocol: 'SAML' | 'OIDC';
    metadata: {
        issuer: string;
        endpoints: {
            sso?: string;
            slo?: string;
            token?: string;
            userinfo?: string;
            jwks?: string;
        };
        certificates: string[];
        claims?: string[];
    };
}

export class FederationAuthService {
    private samlProviders: Map<string, IdentityProvider>;
    private oidcClients: Map<string, OIDCClient>;

    constructor() {
        this.samlProviders = new Map();
        this.oidcClients = new Map();
    }

    async setupPartnerFederation(partner: Partner, config: FederationConfig): Promise<void> {
        try {
            if (config.protocol === 'SAML') {
                await this.setupSAMLFederation(partner, config);
            } else {
                await this.setupOIDCFederation(partner, config);
            }

            logger.info(`Federation setup complete for partner: ${partner.name}`);
        } catch (error) {
            logger.error(`Federation setup failed for partner: ${partner.name}`, error);
            throw error;
        }
    }

    private async setupSAMLFederation(partner: Partner, config: FederationConfig): Promise<void> {
        const idp = new IdentityProvider({
            issuer: config.metadata.issuer,
            ssoUrl: config.metadata.endpoints.sso!,
            sloUrl: config.metadata.endpoints.slo,
            certificates: config.metadata.certificates,
            wantAuthnRequestsSigned: true,
            signatureAlgorithm: 'sha256'
        });

        // Create SP metadata for the partner
        const sp = new ServiceProvider({
            issuer: `https://${partner.id}.dive25.com`,
            callbackUrl: `https://${partner.id}.dive25.com/auth/saml/callback`,
            logoutCallbackUrl: `https://${partner.id}.dive25.com/auth/saml/logout`,
            privateKey: process.env.SAML_PRIVATE_KEY!,
            certificate: process.env.SAML_CERTIFICATE!,
            identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
            authnRequestsSigned: true,
            wantAssertionsSigned: true,
            signatureAlgorithm: 'sha256',
            digestAlgorithm: 'sha256'
        });

        // Exchange metadata
        await this.exchangeSAMLMetadata(partner, sp, idp);

        this.samlProviders.set(partner.id, idp);
    }

    private async setupOIDCFederation(partner: Partner, config: FederationConfig): Promise<void> {
        const issuer = await OIDCIssuer.discover(config.metadata.issuer);

        const client = new issuer.Client({
            client_id: process.env.OIDC_CLIENT_ID!,
            client_secret: process.env.OIDC_CLIENT_SECRET!,
            redirect_uris: [`https://${partner.id}.dive25.com/auth/oidc/callback`],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_basic'
        });

        // Validate required scopes and claims
        await this.validateOIDCConfiguration(client, config);

        this.oidcClients.set(partner.id, client);
    }

    private async exchangeSAMLMetadata(
        partner: Partner,
        sp: ServiceProvider,
        idp: IdentityProvider
    ): Promise<void> {
        // Generate SP metadata
        const spMetadata = sp.generateServiceProviderMetadata();

        // Store metadata for the partner
        await prisma.partnerFederation.upsert({
            where: { partnerId: partner.id },
            create: {
                partnerId: partner.id,
                protocol: 'SAML',
                spMetadata,
                idpMetadata: JSON.stringify(idp.metadata),
                status: 'ACTIVE'
            },
            update: {
                spMetadata,
                idpMetadata: JSON.stringify(idp.metadata),
                status: 'ACTIVE'
            }
        });
    }

    private async validateOIDCConfiguration(
        client: OIDCClient,
        config: FederationConfig
    ): Promise<void> {
        const requiredScopes = ['openid', 'profile', 'email'];
        const requiredClaims = [
            'sub',
            'name',
            'email',
            'organization',
            'clearance_level'
        ];

        // Validate scopes
        const supportedScopes = client.issuer.metadata.scopes_supported || [];
        const missingScopes = requiredScopes.filter(
            scope => !supportedScopes.includes(scope)
        );

        if (missingScopes.length > 0) {
            throw new Error(`Missing required scopes: ${missingScopes.join(', ')}`);
        }

        // Validate claims
        const supportedClaims = client.issuer.metadata.claims_supported || [];
        const missingClaims = requiredClaims.filter(
            claim => !supportedClaims.includes(claim)
        );

        if (missingClaims.length > 0) {
            throw new Error(`Missing required claims: ${missingClaims.join(', ')}`);
        }
    }

    async authenticatePartnerUser(
        partnerId: string,
        protocol: 'SAML' | 'OIDC',
        request: any
    ): Promise<{
        userId: string;
        attributes: Record<string, any>;
    }> {
        if (protocol === 'SAML') {
            const idp = this.samlProviders.get(partnerId);
            if (!idp) throw new Error('SAML provider not configured');

            const { profile } = await idp.validateResponse(request);
            return {
                userId: profile.nameID,
                attributes: profile.attributes
            };
        } else {
            const client = this.oidcClients.get(partnerId);
            if (!client) throw new Error('OIDC client not configured');

            const tokenSet = await client.callback(
                `https://${partnerId}.dive25.com/auth/oidc/callback`,
                request.query
            );

            const userinfo = await client.userinfo(tokenSet);
            return {
                userId: userinfo.sub,
                attributes: userinfo
            };
        }
    }
} 