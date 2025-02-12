// src/app.ts
import express from 'express';
import { asyncHandler } from './asyncHandler';

const app = express();

// In your route handlers, modify:
app.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const data = await someAsyncOperation();
    res.json(data);
    // Don't return res.json()
});

export default app;
