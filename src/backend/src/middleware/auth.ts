import { Response, NextFunction } from 'express';
import { PingFederateService } from '../services/PingFederateService';
import { FederationMonitoringService } from '../services/FederationMonitoringService';
import { LoggerService } from '../services/LoggerService';
import { OPAService } from '../services/OPAService';
import { 
  AuthenticatedRequest, 
  AuthError, 
  UserAttributes,
  RequestWithFederation 
} from '../types';

export class AuthMiddleware {
  private static instance: AuthMiddleware;
  private pingFedService: PingFederateService;
  private monitoringService: FederationMonitoringService;
  private logger: LoggerService;
  private opaService: OPAService;

  private constructor() {
    this.pingFedService = PingFederateService.getInstance();
    this.monitoringService = FederationMonitoringService.getInstance();
    this.logger = LoggerService.getInstance();
    this.opaService = OPAService.getInstance();
  }

  public static getInstance(): AuthMiddleware {
    if (!AuthMiddleware.instance) {
      AuthMiddleware.instance = new AuthMiddleware();
    }
    return AuthMiddleware.instance;
  }

  public authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const partnerId = req.headers['x-federation-partner'] as string;

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        const error = new Error('No token provided') as AuthError;
        error.statusCode = 401;
        error.code = 'AUTH001';
        throw error;
      }

      const token = authHeader.split(' ')[1];
      const userInfo = await this.pingFedService.validateToken(token);

      // Validate required attributes
      if (!this.validateRequiredAttributes(userInfo)) {
        const error = new Error('Missing required user attributes') as AuthError;
        error.statusCode = 401;
        error.code = 'AUTH002';
        throw error;
      }

      // Record authentication success
      await this.monitoringService.recordAuthenticationAttempt(
        partnerId,
        'bearer_token',
        true
      );

      // Record response time
      await this.monitoringService.recordResponseTime(
        partnerId,
        'token_validation',
        Date.now() - startTime
      );

      req.userAttributes = userInfo;
      next();

    } catch (error) {
      // Record authentication failure
      if (partnerId) {
        await this.monitoringService.recordAuthenticationAttempt(
          partnerId,
          'bearer_token',
          false,
          error.message
        );
      }

      this.logger.error('Authentication error', {
        error,
        partnerId,
        requestId: req.headers['x-request-id']
      });

      res.status((error as AuthError).statusCode || 401).json({
        error: error.message || 'Authentication failed',
        code: (error as AuthError).code || 'AUTH000'
      });
    }
  };

  public extractUserAttributes = async (
    req: RequestWithFederation,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.headers.authorization) {
        const error = new Error('No token provided') as AuthError;
        error.statusCode = 401;
        error.code = 'AUTH001';
        throw error;
      }

      const userAttributes: UserAttributes = {
        uniqueIdentifier: req.headers['x-user-id'] as string,
        clearance: req.headers['x-user-clearance'] as string,
        countryOfAffiliation: req.headers['x-user-country'] as string,
        coiTags: (req.headers['x-user-coi'] as string || '').split(',').filter(Boolean),
        lacvCode: req.headers['x-user-lacv'] as string,
        organizationalAffiliation: req.headers['x-user-org'] as string
      };

      // Validate attributes with OPA
      const validationResult = await this.opaService.validateAttributes(userAttributes);
      if (!validationResult.valid) {
        const error = new Error('Invalid user attributes') as AuthError;
        error.statusCode = 401;
        error.code = 'AUTH003';
        error.details = validationResult.missingAttributes;
        throw error;
      }

      req.userAttributes = userAttributes;
      next();

    } catch (error) {
      this.logger.error('User attributes extraction error', {
        error,
        requestId: req.headers['x-request-id']
      });

      res.status((error as AuthError).statusCode || 401).json({
        error: error.message || 'Failed to extract user attributes',
        code: (error as AuthError).code || 'AUTH000',
        details: (error as AuthError).details
      });
    }
  };

  public requireClearance = (minimumClearance: string) => {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const userClearance = req.userAttributes.clearance;
        const hasAccess = await this.opaService.evaluateClearanceAccess(
          userClearance,
          minimumClearance
        );

        if (!hasAccess.allow) {
          const error = new Error('Insufficient clearance level') as AuthError;
          error.statusCode = 403;
          error.code = 'AUTH004';
          throw error;
        }

        next();
      } catch (error) {
        this.logger.error('Clearance check error', {
          error,
          userId: req.userAttributes?.uniqueIdentifier,
          requestId: req.headers['x-request-id']
        });

        res.status((error as AuthError).statusCode || 403).json({
          error: error.message || 'Access denied',
          code: (error as AuthError).code || 'AUTH000'
        });
      }
    };
  };

  private validateRequiredAttributes(userInfo: UserAttributes): boolean {
    const requiredAttributes = [
      'uniqueIdentifier',
      'countryOfAffiliation',
      'clearance'
    ];

    return requiredAttributes.every(attr => 
      userInfo[attr as keyof UserAttributes] !== undefined &&
      userInfo[attr as keyof UserAttributes] !== ''
    );
  }
}

// Export singleton instance
export default AuthMiddleware.getInstance();