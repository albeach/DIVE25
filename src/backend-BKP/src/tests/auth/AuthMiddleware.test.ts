import { AuthMiddleware } from '../../middleware/AuthMiddleware';
import { LoggerService } from '../../services/LoggerService';
import { MetricsService } from '../../services/MetricsService';
import { OPAService } from '../../services/OPAService';
import { Request, Response, NextFunction } from 'express';

describe('AuthMiddleware', () => {
    let authMiddleware: AuthMiddleware;
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction;

    beforeEach(() => {
        mockRequest = {
            headers: {
                authorization: 'Bearer valid-token',
                'x-user-clearance': 'NATO SECRET'
            }
        };
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        nextFunction = jest.fn();
    });

    test('should authenticate valid token', async () => {
        await authMiddleware.authenticate(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction
        );
        expect(nextFunction).toHaveBeenCalled();
    });

    test('should reject invalid clearance level', async () => {
        mockRequest.headers['x-user-clearance'] = 'INVALID';
        await authMiddleware.authenticate(
            mockRequest as Request,
            mockResponse as Response,
            nextFunction
        );
        expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    // Add more auth tests...
}); 