import { Request, Response } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { OPAService } from '../services/OPAService';
import { Document } from '../models/Document';

export class DocumentController {
  private static instance: DocumentController;
  private db: DatabaseService;
  private opa: OPAService;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.opa = OPAService.getInstance();
  }

  public static getInstance(): DocumentController {
    if (!DocumentController.instance) {
      DocumentController.instance = new DocumentController();
    }
    return DocumentController.instance;
  }

  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      const documentId = req.params.id;
      const document = await this.db.getDocument(documentId);
      
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

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
        res.status(403).json({ 
          error: 'Access denied',
          reason: accessResult.reason
        });
        return;
      }

      res.json({ document });
    } catch (error) {
      console.error('Error retrieving document:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async searchDocuments(req: Request, res: Response): Promise<void> {
    try {
      const searchQuery = req.body.query || {};
      const documents = await this.db.searchDocuments(searchQuery);
      
      const accessibleDocuments = await Promise.all(
        documents.map(async (doc) => {
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

      res.json({
        documents: accessibleDocuments.filter(doc => doc !== null)
      });
    } catch (error) {
      console.error('Error searching documents:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}