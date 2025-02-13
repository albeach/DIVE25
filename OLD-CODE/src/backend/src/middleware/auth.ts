import { Request, Response, NextFunction } from 'express';
import { PingFederateService } from '../services/PingFederateService';

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            userAttributes?: UserAttributes;
        }
    }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const pingFedService = PingFederateService.getInstance();

  try {
    const userInfo = await pingFedService.validateToken(token);
    req.userAttributes = userInfo;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export interface UserAttributes {
  clearance: string;
  countryOfAffiliation: string;
  caveats: string[];
  organizationalAffiliation: string;
}

export const extractUserAttributes = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // In production, these would come from PingFederate token claims
    req.userAttributes = {
      clearance: req.headers['x-user-clearance'] as string,
      countryOfAffiliation: req.headers['x-user-country'] as string,
      caveats: (req.headers['x-user-caveats'] as string || '').split(','),
      organizationalAffiliation: req.headers['x-user-org'] as string,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};