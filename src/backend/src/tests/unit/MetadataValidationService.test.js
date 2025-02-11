// src/tests/unit/MetadataValidationService.test.ts
import { MetadataValidationService } from '../../services/MetadataValidationService';

describe('MetadataValidationService', () => {
  const service = MetadataValidationService.getInstance();

  const validMetadata = `<?xml version="1.0"?>
    <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                        entityID="https://test-partner.example.com">
      <!-- Add valid metadata XML structure -->
    </md:EntityDescriptor>`;

  it('should validate correct metadata', async () => {
    const result = await service.validateMetadataContent(validMetadata);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing required elements', async () => {
    const invalidMetadata = `<?xml version="1.0"?>
      <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
      </md:EntityDescriptor>`;
    
    const result = await service.validateMetadataContent(invalidMetadata);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing entityID attribute');
  });
});