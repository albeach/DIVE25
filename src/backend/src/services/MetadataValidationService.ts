// src/services/MetadataValidationService.ts
import { DOMParser, XMLSerializer } from 'xmldom';
import { SignedXml, FileKeyInfo } from 'xml-crypto';
import axios from 'axios';
import { X509Certificate } from 'crypto';
import { LoggerService } from './LoggerService';
import { ValidationError } from '../utils/errors';

export interface MetadataValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    entityId?: string;
    endpoints?: {
        sso?: string;
        slo?: string;
        artifact?: string;
    };
    certificates?: {
        signing?: string[];
        encryption?: string[];
    };
}

export class MetadataValidationService {
    private static instance: MetadataValidationService;
    private readonly logger: LoggerService;
    private readonly parser: DOMParser;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.parser = new DOMParser();
    }

    public static getInstance(): MetadataValidationService {
        if (!MetadataValidationService.instance) {
            MetadataValidationService.instance = new MetadataValidationService();
        }
        return MetadataValidationService.instance;
    }

    async validateMetadata(metadataUrl: string): Promise<MetadataValidationResult> {
        try {
            const metadata = await this.fetchMetadata(metadataUrl);
            return this.validateMetadataContent(metadata);
        } catch (error) {
            const validationError = error instanceof ValidationError ? error : 
                new ValidationError('Failed to fetch metadata', { cause: error });
            
            this.logger.error('Metadata validation error:', validationError);
            
            return {
                valid: false,
                errors: [validationError.message],
                warnings: []
            };
        }
    }

    async validateMetadataContent(metadata: string): Promise<MetadataValidationResult> {
        const result: MetadataValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            endpoints: {},
            certificates: {
                signing: [],
                encryption: []
            }
        };

        try {
            const doc = this.parser.parseFromString(metadata);
            
            // Validate XML structure
            if (!doc.documentElement) {
                throw new ValidationError('Invalid XML document');
            }

            // Extract and validate entityID
            const entityId = doc.documentElement.getAttribute('entityID');
            if (!entityId) {
                throw new ValidationError('Missing entityID attribute');
            }
            result.entityId = entityId;

            // Validate endpoints
            const endpoints = this.extractEndpoints(doc);
            result.endpoints = endpoints;
            
            if (!endpoints?.sso) {
                result.errors.push('Missing SSO endpoint');
                result.valid = false;
            }

            // Extract and validate certificates
            const certificates = this.extractCertificates(doc);
            result.certificates = certificates;
            
            if (!certificates.signing?.length) {
                result.errors.push('Missing signing certificate');
                result.valid = false;
            }

            // Validate certificate expiration
            await this.validateCertificates(certificates, result);

        } catch (error) {
            const validationError = error instanceof ValidationError ? error :
                new ValidationError('Metadata validation error', { cause: error });
            
            result.errors.push(validationError.message);
            result.valid = false;
        }

        return result;
    }

    private async fetchMetadata(url: string): Promise<string> {
        try {
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            throw new ValidationError(`Failed to fetch metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private extractEndpoints(doc: Document): MetadataValidationResult['endpoints'] {
        const endpoints: Required<MetadataValidationResult>['endpoints'] = {
            sso: undefined,
            slo: undefined,
            artifact: undefined
        };

        const idpDescriptor = doc.getElementsByTagNameNS(
            'urn:oasis:names:tc:SAML:2.0:metadata',
            'IDPSSODescriptor'
        )[0];

        if (idpDescriptor) {
            // Extract SSO endpoint
            const ssoElements = idpDescriptor.getElementsByTagNameNS(
                'urn:oasis:names:tc:SAML:2.0:metadata',
                'SingleSignOnService'
            );
            for (let i = 0; i < ssoElements.length; i++) {
                const binding = ssoElements[i].getAttribute('Binding');
                if (binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect') {
                    endpoints.sso = ssoElements[i].getAttribute('Location') || undefined;
                    break;
                }
            }

            // Extract SLO endpoint
            const sloElements = idpDescriptor.getElementsByTagNameNS(
                'urn:oasis:names:tc:SAML:2.0:metadata',
                'SingleLogoutService'
            );
            for (let i = 0; i < sloElements.length; i++) {
                const binding = sloElements[i].getAttribute('Binding');
                if (binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect') {
                    endpoints.slo = sloElements[i].getAttribute('Location') || undefined;
                    break;
                }
            }
        }

        return endpoints;
    }

    private extractCertificates(doc: Document): Required<MetadataValidationResult>['certificates'] {
        const certificates: Required<MetadataValidationResult>['certificates'] = {
            signing: [],
            encryption: []
        };

        const idpDescriptor = doc.getElementsByTagNameNS(
            'urn:oasis:names:tc:SAML:2.0:metadata',
            'IDPSSODescriptor'
        )[0];

        if (idpDescriptor) {
            const keyDescriptors = idpDescriptor.getElementsByTagNameNS(
                'urn:oasis:names:tc:SAML:2.0:metadata',
                'KeyDescriptor'
            );

            for (let i = 0; i < keyDescriptors.length; i++) {
                const use = keyDescriptors[i].getAttribute('use');
                const certData = keyDescriptors[i].getElementsByTagNameNS(
                    'http://www.w3.org/2000/09/xmldsig#',
                    'X509Certificate'
                )[0]?.textContent?.trim();

                if (certData) {
                    if (use === 'signing' || !use) {
                        certificates.signing?.push(certData);
                    }
                    if (use === 'encryption' || !use) {
                        certificates.encryption?.push(certData);
                    }
                }
            }
        }

        return certificates;
    }

    private async validateCertificates(
        certificates: Required<MetadataValidationResult>['certificates'],
        result: MetadataValidationResult
    ): Promise<void> {
        const now = new Date();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        for (const cert of certificates.signing || []) {
            try {
                const x509 = new X509Certificate(cert);
                const expiryDate = new Date(x509.validTo);

                if (expiryDate < now) {
                    result.errors.push('Signing certificate has expired');
                    result.valid = false;
                } else if (expiryDate.getTime() - now.getTime() < thirtyDays) {
                    result.warnings.push('Signing certificate will expire within 30 days');
                }
            } catch (error) {
                result.errors.push('Invalid certificate format');
                result.valid = false;
            }
        }
    }
}

export default MetadataValidationService;