// src/app.ts
import express, { NextFunction } from 'express';
import { asyncHandler } from './backend/src/middleware/asyncHandler';

const app = express();

// In your route handlers, modify:
app.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const data = await someAsyncOperation();
    res.json(data);
    //Don't return res.json()
});

export default app;

