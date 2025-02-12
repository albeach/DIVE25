// src/utils/errorUtils.ts
import { AuthError } from '../types';

export function asAuthError(error: unknown): AuthError {
    if (error instanceof Error) {
        return {
            ...error,
            statusCode: (error as AuthError).statusCode || 500,
            code: (error as AuthError).code || 'UNKNOWN_ERROR',
            details: (error as AuthError).details
        } as AuthError;
    }

    return {
        name: 'UnknownError',
        message: String(error),
        statusCode: 500,
        code: 'UNKNOWN_ERROR'
    } as AuthError;
}