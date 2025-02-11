// src/services/MetadataValidationService.ts
import { DOMParser, XMLSerializer } from 'xmldom';
import { SignedXml, FileKeyInfo } from 'xml-crypto';
import axios from 'axios';
import { X509Certificate } from 'crypto';

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

  private constructor() {}

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
      return {
        valid: false,
        errors: [`Failed to fetch metadata: ${error.message}`],
        warnings: []
      };
    }
  }

  async validateMetadataContent(metadata: string): Promise<MetadataValidationResult> {
    const result: MetadataValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    try {
      const doc = new DOMParser().parseFromString(metadata);
      
      // Validate XML structure
      if (!doc.documentElement) {
        result.errors.push('Invalid XML document');
        result.valid = false;
        return result;
      }

      // Extract and validate entityID
      const entityId = doc.documentElement.getAttribute('entityID');
      if (!entityId) {
        result.errors.push('Missing entityID attribute');
        result.valid = false;
      } else {
        result.entityId = entityId;
      }

      // Validate endpoints
      result.endpoints = this.extractEndpoints(doc);
      if (!result.endpoints.sso) {
        result.errors.push('Missing SSO endpoint');
        result.valid = false;
      }

      // Extract and validate certificates
      result.certificates = this.extractCertificates(doc);
      if (!result.certificates.signing || result.certificates.signing.length === 0) {
        result.errors.push('Missing signing certificate');
        result.valid = false;
      }

      // Validate certificate expiration
      for (const cert of result.certificates.signing || []) {
        const certObj = new X509Certificate(cert);
        const expiryDate = new Date(certObj.validTo);
        if (expiryDate < new Date()) {
          result.errors.push('Signing certificate has expired');
          result.valid = false;
        } else if (expiryDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
          result.warnings.push('Signing certificate will expire within 30 days');
        }
      }

    } catch (error) {
      result.errors.push(`Metadata validation error: ${error.message}`);
      result.valid = false;
    }

    return result;
  }

  private async fetchMetadata(url: string): Promise<string> {
    const response = await axios.get(url);
    return response.data;
  }

  private extractEndpoints(doc: Document): any {
    const endpoints: any = {};
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
          endpoints.sso = ssoElements[i].getAttribute('Location');
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
          endpoints.slo = sloElements[i].getAttribute('Location');
          break;
        }
      }
    }

    return endpoints;
  }

  private extractCertificates(doc: Document): any {
    const certificates: any = {
      signing: [],
      encryption: []
    };

    const idpDescriptor = doc.getElementsByTagNameNS(
      'urn:oasis:names:tc:SAML:2.0:metadata',
      'IDPSSODescriptor'
    )[0];

    if (idpDescriptor) {
      // Extract signing certificates
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
            certificates.signing.push(certData);
          }
          if (use === 'encryption' || !use) {
            certificates.encryption.push(certData);
          }
        }
      }
    }

    return certificates;
  }
}