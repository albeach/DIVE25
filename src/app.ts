// src/app.ts
import express from 'express';
import { asyncHandler } from './asyncHandler';

const app = express();

app.get(
  '/',
  asyncHandler(async (req, res, next) => {
    // Perform some async operation…
    const data = await someAsyncOperation();
    // Send the response – note: we don’t return res.json(), just call it.
    res.json(data);
  })
);

export default app;
