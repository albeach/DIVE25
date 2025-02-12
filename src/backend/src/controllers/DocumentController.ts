import { Response } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { OPAService } from '../services/OPAService';
import { Document } from '../models/Document';
import { LoggerService } from '../services/LoggerService';
import { 
 AuthenticatedRequest, 
 DocumentSearchQuery,
 AuthError 
} from '../types';
import { ObjectId } from 'mongodb';

export class DocumentController {
 private static instance: DocumentController;
 private db: DatabaseService;
 private opa: OPAService;
 private logger: LoggerService;

 private constructor() {
   this.db = DatabaseService.getInstance();
   this.opa = OPAService.getInstance();
   this.logger = LoggerService.getInstance();
 }

 public static getInstance(): DocumentController {
   if (!DocumentController.instance) {
     DocumentController.instance = new DocumentController();
   }
   return DocumentController.instance;
 }

 async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
   try {
     const documentId = req.params.id;

     // Validate document ID format
     if (!ObjectId.isValid(documentId)) {
       const error = new Error('Invalid document ID format') as AuthError;
       error.statusCode = 400;
       throw error;
     }

     const document = await this.db.getDocument(documentId);
     
     if (!document) {
       const error = new Error('Document not found') as AuthError;
       error.statusCode = 404;
       throw error;
     }

     // Check access permissions
     const accessResult = await this.opa.evaluateAccess(
       req.userAttributes,
       {
         clearance: document.clearance,
         releasableTo: document.releasableTo,
         coiTags: document.coiTags,
         lacvCode: document.lacvCode
       }
     );
     
     if (!accessResult.allow) {
       this.logger.warn('Access denied', {
         userId: req.userAttributes.uniqueIdentifier,
         documentId,
         reason: accessResult.reason
       });

       const error = new Error('Access denied') as AuthError;
       error.statusCode = 403;
       error.code = accessResult.reason;
       throw error;
     }

     // Log successful access
     this.logger.info('Document accessed', {
       userId: req.userAttributes.uniqueIdentifier,
       documentId
     });

     res.json({ document });
   } catch (error) {
     const err = error as AuthError;
     this.logger.error('Error retrieving document', {
       error: err,
       userId: req.userAttributes?.uniqueIdentifier,
       documentId: req.params.id
     });

     res.status(err.statusCode || 500).json({ 
       error: err.message || 'Internal server error',
       code: err.code
     });
   }
 }

 async searchDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
   try {
     const searchQuery = this.validateSearchQuery(req.body.query || {});
     const page = parseInt(req.query.page as string) || 1;
     const limit = parseInt(req.query.limit as string) || 10;

     const documents = await this.db.searchDocuments(searchQuery, {
       page,
       limit,
       sort: req.query.sort as string
     });
     
     const accessibleDocuments = await Promise.all(
       documents.map(async (doc: Document) => {
         const accessResult = await this.opa.evaluateAccess(
           req.userAttributes,
           {
             clearance: doc.clearance,
             releasableTo: doc.releasableTo,
             coiTags: doc.coiTags,
             lacvCode: doc.lacvCode
           }
         );
         return accessResult.allow ? doc : null;
       })
     );

     const filteredDocuments = accessibleDocuments.filter((doc): doc is Document => doc !== null);

     // Get total count for pagination
     const totalCount = await this.db.countDocuments(searchQuery);

     // Log search results
     this.logger.info('Document search performed', {
       userId: req.userAttributes.uniqueIdentifier,
       query: searchQuery,
       resultCount: filteredDocuments.length,
       totalCount
     });

     res.json({
       documents: filteredDocuments,
       pagination: {
         page,
         limit,
         total: totalCount,
         pages: Math.ceil(totalCount / limit)
       }
     });
   } catch (error) {
     const err = error as AuthError;
     this.logger.error('Error searching documents', {
       error: err,
       userId: req.userAttributes?.uniqueIdentifier,
       query: req.body.query
     });

     res.status(err.statusCode || 500).json({ 
       error: err.message || 'Internal server error',
       code: err.code
     });
   }
 }

 async createDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
   try {
     const documentData = this.validateDocumentData(req.body);

     // Ensure user has sufficient clearance to create document
     if (!this.hasAdequateClearance(req.userAttributes.clearance, documentData.clearance)) {
       const error = new Error('Insufficient clearance to create document') as AuthError;
       error.statusCode = 403;
       error.code = 'INSUFFICIENT_CLEARANCE';
       throw error;
     }

     const newDocument = await this.db.createDocument({
       ...documentData,
       metadata: {
         createdAt: new Date(),
         createdBy: req.userAttributes.uniqueIdentifier,
         lastModified: new Date(),
         version: 1
       }
     });

     this.logger.info('Document created', {
       userId: req.userAttributes.uniqueIdentifier,
       documentId: newDocument._id
     });

     res.status(201).json({ document: newDocument });
   } catch (error) {
     const err = error as AuthError;
     this.logger.error('Error creating document', {
       error: err,
       userId: req.userAttributes?.uniqueIdentifier
     });

     res.status(err.statusCode || 500).json({
       error: err.message || 'Internal server error',
       code: err.code
     });
   }
 }

 async updateDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
   try {
     const documentId = req.params.id;
     
     if (!ObjectId.isValid(documentId)) {
       const error = new Error('Invalid document ID format') as AuthError;
       error.statusCode = 400;
       throw error;
     }

     const existingDocument = await this.db.getDocument(documentId);
     
     if (!existingDocument) {
       const error = new Error('Document not found') as AuthError;
       error.statusCode = 404;
       throw error;
     }

     // Check update permissions
     const updateResult = await this.opa.evaluateUpdateAccess(
       req.userAttributes,
       existingDocument
     );

     if (!updateResult.allow) {
       const error = new Error('Insufficient permissions to update document') as AuthError;
       error.statusCode = 403;
       error.code = updateResult.reason;
       throw error;
     }

     const updatedData = this.validateDocumentData(req.body);
     const updatedDocument = await this.db.updateDocument(documentId, {
       ...updatedData,
       metadata: {
         ...existingDocument.metadata,
         lastModified: new Date(),
         version: existingDocument.metadata.version + 1,
         lastModifiedBy: req.userAttributes.uniqueIdentifier
       }
     });

     this.logger.info('Document updated', {
       userId: req.userAttributes.uniqueIdentifier,
       documentId
     });

     res.json({ document: updatedDocument });
   } catch (error) {
     const err = error as AuthError;
     this.logger.error('Error updating document', {
       error: err,
       userId: req.userAttributes?.uniqueIdentifier,
       documentId: req.params.id
     });

     res.status(err.statusCode || 500).json({
       error: err.message || 'Internal server error',
       code: err.code
     });
   }
 }

 private validateSearchQuery(query: any): DocumentSearchQuery {
   const validatedQuery: DocumentSearchQuery = {};

   if (query.clearance && typeof query.clearance === 'string') {
     validatedQuery.clearance = query.clearance;
   }

   if (Array.isArray(query.releasableTo)) {
     validatedQuery.releasableTo = query.releasableTo;
   }

   if (Array.isArray(query.coiTags)) {
     validatedQuery.coiTags = query.coiTags;
   }

   if (query.lacvCode && typeof query.lacvCode === 'string') {
     validatedQuery.lacvCode = query.lacvCode;
   }

   if (query.dateRange) {
     validatedQuery.dateRange = {
       start: new Date(query.dateRange.start),
       end: new Date(query.dateRange.end)
     };
   }

   return validatedQuery;
 }

 private validateDocumentData(data: any): Partial<Document> {
   const validatedData: Partial<Document> = {};
   
   if (!data.title || typeof data.title !== 'string') {
     const error = new Error('Invalid document title') as AuthError;
     error.statusCode = 400;
     throw error;
   }
   validatedData.title = data.title;

   if (!data.clearance || !this.isValidClearance(data.clearance)) {
     const error = new Error('Invalid clearance level') as AuthError;
     error.statusCode = 400;
     throw error;
   }
   validatedData.clearance = data.clearance;

   if (!Array.isArray(data.releasableTo)) {
     const error = new Error('Invalid releasableTo format') as AuthError;
     error.statusCode = 400;
     throw error;
   }
   validatedData.releasableTo = data.releasableTo;

   if (data.coiTags !== undefined) {
     if (!Array.isArray(data.coiTags)) {
       const error = new Error('Invalid coiTags format') as AuthError;
       error.statusCode = 400;
       throw error;
     }
     validatedData.coiTags = data.coiTags;
   }

   if (data.lacvCode !== undefined) {
     if (typeof data.lacvCode !== 'string') {
       const error = new Error('Invalid lacvCode format') as AuthError;
       error.statusCode = 400;
       throw error;
     }
     validatedData.lacvCode = data.lacvCode;
   }

   return validatedData;
 }

 private hasAdequateClearance(userClearance: string, documentClearance: string): boolean {
   const clearanceLevels: { [key: string]: number } = {
     'UNCLASSIFIED': 0,
     'RESTRICTED': 1,
     'NATO CONFIDENTIAL': 2,
     'NATO SECRET': 3,
     'COSMIC TOP SECRET': 4
   };

   return (clearanceLevels[userClearance] || 0) >= (clearanceLevels[documentClearance] || 0);
 }

 private isValidClearance(clearance: string): boolean {
   const validClearances = [
     'UNCLASSIFIED',
     'RESTRICTED', 
     'NATO CONFIDENTIAL',
     'NATO SECRET',
     'COSMIC TOP SECRET'
   ];
   return validClearances.includes(clearance);
 }
}

export default DocumentController;