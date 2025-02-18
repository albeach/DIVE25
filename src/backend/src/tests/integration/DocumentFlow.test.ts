import request from 'supertest';
import { App } from '../../app';
import { DatabaseService } from '../../services/DatabaseService';

describe('Document Flow Integration', () => {
    let app: App;
    let db: DatabaseService;
    let authToken: string;

    beforeAll(async () => {
        app = new App();
        db = DatabaseService.getInstance();
        await db.connect();
        // Setup test data
    });

    afterAll(async () => {
        await db.disconnect();
    });

    test('complete document lifecycle', async () => {
        // Create document
        const createResponse = await request(app.getApp())
            .post('/api/documents')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
                // ... document data
            });
        expect(createResponse.status).toBe(201);

        const docId = createResponse.body.id;

        // Read document
        const readResponse = await request(app.getApp())
            .get(`/api/documents/${docId}`)
            .set('Authorization', `Bearer ${authToken}`);
        expect(readResponse.status).toBe(200);

        // Update document
        // Delete document
        // ... test complete lifecycle
    });
}); 