import { UserAttributes } from '../types';

declare global {
    namespace Express {
        interface Request {
            userAttributes: UserAttributes;
            document?: NATODocument;
            startTime?: number;
        }
    }
}