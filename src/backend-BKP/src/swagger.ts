import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'DIVE25 API Documentation',
            version: '1.0.0',
            description: 'API documentation for DIVE25 NATO Partner Federation Platform',
            contact: {
                name: 'DIVE25 Support',
                email: 'support@dive25.com'
            }
        },
        servers: [
            {
                url: 'https://api.dive25.com',
                description: 'Production server'
            },
            {
                url: 'http://localhost:6969',
                description: 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        },
        security: [{
            bearerAuth: []
        }]
    },
    apis: ['./src/routes/*.ts', './src/types/*.ts']
};

export function setupSwagger(app: Express) {
    const specs = swaggerJsdoc(options);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
} 