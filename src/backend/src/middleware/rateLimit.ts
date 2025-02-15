// In src/middleware/rateLimit.ts

import rateLimit from 'express-rate-limit';
import { config } from '../config/config';

export const securityOperationsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 security-sensitive requests per windowMs
    message: 'Too many sensitive operations from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use combination of IP and user ID for more granular control
        return `${req.ip}-${(req as any).userAttributes?.uniqueIdentifier}`;
    }
});