import KcAdminClient from '@keycloak/keycloak-admin-client';
import { Partner } from '@prisma/client';
import { logger } from '../utils/logger';

export class KeycloakFederationService {
    private kcAdmin: KcAdminClient;
    private readonly realm: string;

    constructor() {
        this.realm = process.env.KEYCLOAK_REALM!;
        this.kcAdmin = new KcAdminClient({
            baseUrl: process.env.KEYCLOAK_URL,
            realmName: 'master'
        });
    }

    async init() {
        await this.kcAdmin.auth({
            grantType: 'client_credentials',
            clientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID!,
            clientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET!
        });
    }

    async createIdpConfiguration(partner: Partner, federationMetadata: any) {
        await this.init();

        try {
            const idpAlias = `${partner.id}-idp`;

            if (federationMetadata.protocol === 'SAML') {
                await this.createSamlIdp(idpAlias, partner, federationMetadata);
            } else {
                await this.createOidcIdp(idpAlias, partner, federationMetadata);
            }

            // Set up mappers for partner-specific attributes
            await this.setupIdpMappers(idpAlias, partner);

            logger.info(`Created Keycloak IdP configuration for partner: ${partner.name}`);
        } catch (error) {
            logger.error(`Failed to create Keycloak IdP configuration: ${error}`);
            throw error;
        }
    }

    private async createSamlIdp(idpAlias: string, partner: Partner, metadata: any) {
        await this.kcAdmin.identityProviders.create({
            realm: this.realm,
            alias: idpAlias,
            displayName: partner.name,
            providerId: 'saml',
            enabled: true,
            trustEmail: false,
            storeToken: false,
            addReadTokenRoleOnCreate: false,
            config: {
                entityId: metadata.entityId,
                singleSignOnServiceUrl: metadata.ssoEndpoint,
                singleLogoutServiceUrl: metadata.sloEndpoint,
                nameIDPolicyFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
                principalType: 'SUBJECT',
                signatureAlgorithm: 'RSA_SHA256',
                xmlSignKeyInfoKeyNameTransformer: 'KEY_ID',
                postBindingResponse: 'true',
                postBindingAuthnRequest: 'true',
                validateSignature: 'true',
                signingCertificate: metadata.signingCertificate,
                wantAuthnRequestsSigned: 'true',
                backchannelSupported: 'true'
            }
        });
    }

    private async createOidcIdp(idpAlias: string, partner: Partner, metadata: any) {
        await this.kcAdmin.identityProviders.create({
            realm: this.realm,
            alias: idpAlias,
            displayName: partner.name,
            providerId: 'oidc',
            enabled: true,
            trustEmail: false,
            storeToken: false,
            addReadTokenRoleOnCreate: false,
            config: {
                issuer: metadata.issuer,
                authorizationUrl: metadata.authorizationEndpoint,
                tokenUrl: metadata.tokenEndpoint,
                userInfoUrl: metadata.userinfoEndpoint,
                clientId: metadata.clientId,
                clientSecret: metadata.clientSecret,
                defaultScope: 'openid profile email organization clearance_level',
                validateSignature: 'true',
                useJwksUrl: 'true',
                jwksUrl: metadata.jwksUri
            }
        });
    }

    private async setupIdpMappers(idpAlias: string, partner: Partner) {
        const mappers = [
            {
                name: 'organization',
                identityProviderAlias: idpAlias,
                identityProviderMapper: 'oidc-user-attribute-idp-mapper',
                config: {
                    claim: 'organization',
                    'user.attribute': 'organization'
                }
            },
            {
                name: 'clearance_level',
                identityProviderAlias: idpAlias,
                identityProviderMapper: 'oidc-user-attribute-idp-mapper',
                config: {
                    claim: 'clearance_level',
                    'user.attribute': 'clearanceLevel'
                }
            },
            {
                name: 'partner_id',
                identityProviderAlias: idpAlias,
                identityProviderMapper: 'hardcoded-attribute-idp-mapper',
                config: {
                    attribute: 'partnerId',
                    'attribute.value': partner.id
                }
            }
        ];

        for (const mapper of mappers) {
            await this.kcAdmin.identityProviders.createMapper({
                realm: this.realm,
                alias: idpAlias,
                mapperId: mapper.name
            }, mapper);
        }
    }
} 