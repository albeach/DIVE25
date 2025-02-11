// src/tests/integration/federation.test.ts
import request from 'supertest';
import { app } from '../../app';
import { FederationPartnerService } from '../../services/FederationPartnerService';
import { OPAService } from '../../services/OPAService';

describe('Federation Integration Tests', () => {
  const partnerService = FederationPartnerService.getInstance();
  const opaService = OPAService.getInstance();

  beforeAll(async () => {
    // Setup test environment
  });

  afterAll(async () => {
    // Cleanup test environment
  });

  describe('Partner Onboarding', () => {
    const testPartner = {
      partnerId: 'TEST_PARTNER',
      partnerName: 'Test Partner',
      federationType: 'SAML',
      metadata: {
        url: 'https://test-partner.example.com/metadata'
      },
      attributeMapping: {
        uniqueIdentifier: 'uid',
        countryOfAffiliation: 'country',
        clearance: 'clearanceLevel'
      }
    };

    it('should successfully onboard a new partner', async () => {
      const response = await request(app)
        .post('/api/partners/onboard')
        .send({ partnerConfig: testPartner })
        .set('Authorization', 'Bearer test-admin-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('partnerConnection');
    });

    it('should validate partner metadata', async () => {
      const response = await request(app)
        .post('/api/partners/validate-metadata')
        .send({ metadataUrl: testPartner.metadata.url })
        .set('Authorization', 'Bearer test-admin-token');

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });
  });

  describe('Access Control', () => {
    const testUser = {
      uniqueIdentifier: 'test-user',
      countryOfAffiliation: 'USA',
      clearance: 'NATO SECRET',
      coiTags: ['OpAlpha'],
      lacvCode: 'LACV001'
    };

    const testDocument = {
      clearance: 'NATO CONFIDENTIAL',
      releasableTo: ['NATO', 'FVEY'],
      coiTags: ['OpAlpha'],
      lacvCode: 'LACV001'
    };

    it('should allow access when policy conditions are met', async () => {
      const accessResult = await opaService.evaluateAccess(testUser, testDocument);
      expect(accessResult.allow).toBe(true);
    });

    it('should deny access when clearance is insufficient', async () => {
      const lowClearanceUser = { ...testUser, clearance: 'NATO RESTRICTED' };
      const accessResult = await opaService.evaluateAccess(lowClearanceUser, testDocument);
      expect(accessResult.allow).toBe(false);
    });
  });

  describe('Federation Monitoring', () => {
    it('should record and retrieve partner metrics', async () => {
      const response = await request(app)
        .get('/api/monitoring/partners/TEST_PARTNER/metrics')
        .set('Authorization', 'Bearer test-admin-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activePartners');
      expect(response.body).toHaveProperty('authenticationAttempts');
    });

    it('should detect and alert on partner health issues', async () => {
      const response = await request(app)
        .get('/api/monitoring/health/alerts')
        .set('Authorization', 'Bearer test-admin-token');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});