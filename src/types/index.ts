import { Request } from 'express';
import { IDocument } from '../models/Document';

export interface AuthenticatedRequest extends Request {
    document?: IDocument;
    user: Express.User;  // Now TypeScript knows about the user property
} 