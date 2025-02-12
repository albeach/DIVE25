// src/middleware/documentValidation.ts
import { Response, NextFunction } from 'express';
import { 
   ClearanceLevel,
   CoiTag,
   LacvCode,
   Document,
   ValidClearanceLevels,
   ValidCoiTags,
   ValidLacvCodes,
   ValidReleasabilityMarkers,
   ReleasabilityMarker
} from '../models/Document';
import { AuthenticatedRequest, AuthError } from '../types';
import { LoggerService } from '../services/LoggerService';
import { asAuthError } from '../utils/errorUtils';

export class DocumentValidationMiddleware {
   private static instance: DocumentValidationMiddleware;
   private readonly logger: LoggerService;

   private constructor() {
       this.logger = LoggerService.getInstance();
   }

   public static getInstance(): DocumentValidationMiddleware {
       if (!DocumentValidationMiddleware.instance) {
           DocumentValidationMiddleware.instance = new DocumentValidationMiddleware();
       }
       return DocumentValidationMiddleware.instance;
   }

   public validateDocument = async (
       req: AuthenticatedRequest,
       res: Response,
       next: NextFunction
   ): Promise<void> => {
       try {
           const document = req.body as Partial<Document>;

           // Validate required fields
           this.validateRequiredFields(document);

           // Validate clearance level
           if (!this.isValidClearance(document.clearance)) {
               throw this.createValidationError(
                   'Invalid clearance level',
                   400,
                   'VAL001',
                   { validLevels: ValidClearanceLevels }
               );
           }

           // Validate releasability markers
           if (!this.validateReleasabilityMarkers(document.releasableTo)) {
               throw this.createValidationError(
                   'Invalid releasability markers',
                   400,
                   'VAL002',
                   { validMarkers: ValidReleasabilityMarkers }
               );
           }

           // Validate COI tags if present
           if (document.coiTags && !this.validateCoiTags(document.coiTags)) {
               throw this.createValidationError(
                   'Invalid COI tags',
                   400,
                   'VAL003',
                   { validTags: ValidCoiTags }
               );
           }

           // Validate LACV code if present
           if (document.lacvCode && !this.isValidLacvCode(document.lacvCode)) {
               throw this.createValidationError(
                   'Invalid LACV code',
                   400,
                   'VAL004',
                   { validCodes: ValidLacvCodes }
               );
           }

           // Validate user has permission to set clearance level
           if (!req.userAttributes) {
               throw this.createValidationError(
                   'User attributes not found',
                   401,
                   'VAL005'
               );
           }

           if (!this.hasAdequateClearance(
               req.userAttributes.clearance as ClearanceLevel,
               document.clearance as ClearanceLevel
           )) {
               throw this.createValidationError(
                   'Insufficient clearance to set document classification',
                   403,
                   'VAL006'
               );
           }

           next();
       } catch (error) {
           const validationError = asAuthError(error);

           this.logger.error('Document validation error', {
               error: validationError,
               userId: req.userAttributes?.uniqueIdentifier,
               document: req.body
           });

           res.status(validationError.statusCode || 400).json({
               error: validationError.message || 'Document validation failed',
               code: validationError.code || 'VAL000',
               details: validationError.details
           });
       }
   };

   private validateRequiredFields(document: Partial<Document>): void {
       const requiredFields = ['title', 'clearance', 'releasableTo'];
       const missingFields = requiredFields.filter(field => !(field in document));

       if (missingFields.length > 0) {
           throw this.createValidationError(
               'Missing required fields',
               400,
               'VAL007',
               { missingFields }
           );
       }
   }

   private isValidClearance(clearance: unknown): clearance is ClearanceLevel {
       return typeof clearance === 'string' && 
              ValidClearanceLevels.includes(clearance as ClearanceLevel);
   }

   private validateReleasabilityMarkers(markers: unknown): markers is ReleasabilityMarker[] {
       return Array.isArray(markers) && 
              markers.every(marker => 
                  ValidReleasabilityMarkers.includes(marker as ReleasabilityMarker)
              );
   }

   private validateCoiTags(tags: unknown): tags is CoiTag[] {
       return Array.isArray(tags) && 
              tags.every(tag => 
                  ValidCoiTags.includes(tag as CoiTag)
              );
   }

   private isValidLacvCode(code: unknown): code is LacvCode {
       return typeof code === 'string' && 
              ValidLacvCodes.includes(code as LacvCode);
   }

   private hasAdequateClearance(
       userClearance: ClearanceLevel,
       documentClearance: ClearanceLevel
   ): boolean {
       const clearanceLevels: { [key in ClearanceLevel]: number } = {
           'UNCLASSIFIED': 0,
           'RESTRICTED': 1,
           'NATO CONFIDENTIAL': 2,
           'NATO SECRET': 3,
           'COSMIC TOP SECRET': 4
       };

       return clearanceLevels[userClearance] >= clearanceLevels[documentClearance];
   }

   private createValidationError(
       message: string,
       statusCode: number,
       code: string,
       details?: Record<string, unknown>
   ): AuthError {
       const error = new Error(message) as AuthError;
       error.statusCode = statusCode;
       error.code = code;
       if (details) {
           error.details = details;
       }
       return error;
   }
}

export default DocumentValidationMiddleware.getInstance();