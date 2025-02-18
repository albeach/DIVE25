import { SecurityValidationService } from '../../services/SecurityValidationService';
import { NATODocument } from '../../types';

describe('SecurityValidation', () => {
    let securityValidation: SecurityValidationService;
    let mockDocument: NATODocument;

    beforeEach(() => {
        mockDocument = {
            // ... document properties
        };
    });

    test('should detect classification mismatch', async () => {
        mockDocument.metadata = {
            classification: 'NATO SECRET',
            contentClassification: 'RESTRICTED'
        };
        const result = await securityValidation.validateDocument(mockDocument);
        expect(result.valid).toBe(false);
    });

    test('should validate proper markings', async () => {
        // ... test security markings
    });

    // Add more security validation tests...
}); 