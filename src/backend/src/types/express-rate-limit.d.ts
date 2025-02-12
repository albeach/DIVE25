// src/types/express-rate-limit.d.ts
declare module 'express-rate-limit' {
    import { RequestHandler } from 'express';

    interface Options {
        windowMs?: number;
        max?: number;
        message?: string;
        statusCode?: number;
        headers?: boolean;
        skipFailedRequests?: boolean;
        skipSuccessfulRequests?: boolean;
    }

    function rateLimit(options?: Options): RequestHandler;
    export = rateLimit;
}