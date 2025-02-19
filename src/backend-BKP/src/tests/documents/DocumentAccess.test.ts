import { DocumentAccessMiddleware } from '../../middleware/DocumentAccess';
import { NATODocument, UserAttributes } from '../../types';

describe('DocumentAccess', () => {
    let documentAccess: DocumentAccessMiddleware;
    let mockDocument: NATODocument;
    let mockUser: UserAttributes;

    beforeEach(() => {
        mockDocument = {
            id: '123',
            classification: 'NATO SECRET',
            coi: ['CYBER'],
            version: 1,
            // ... other document properties
        };

        mockUser = {
            uniqueIdentifier: 'TEST_USER_001',
            clearanceLevel: 'NATO SECRET',
            coiAccess: ['CYBER'],
            // ... other user properties
        };
    });

    test('should allow access to matching clearance', async () => {
        const result = await documentAccess.validateAccess(mockUser, mockDocument);
        expect(result.allowed).toBe(true);
    });

    test('should deny access to insufficient clearance', async () => {
        mockUser.clearanceLevel = 'RESTRICTED';
        const result = await documentAccess.validateAccess(mockUser, mockDocument);
        expect(result.allowed).toBe(false);
    });

    // Add more access control tests...
}); 