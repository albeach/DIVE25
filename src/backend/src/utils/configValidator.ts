import Joi from 'joi';
import { Config } from '../config/config';

const configSchema = Joi.object({
    env: Joi.string().valid('development', 'production', 'test').required(),
    port: Joi.number().port().required(),

    mongodb: Joi.object({
        uri: Joi.string().required(),
        dbName: Joi.string().required(),
        options: Joi.object({
            maxPoolSize: Joi.number().min(1).required(),
            connectTimeoutMS: Joi.number().min(1000).required(),
            socketTimeoutMS: Joi.number().min(1000).required()
        }).required()
    }).required(),

    redis: Joi.object({
        host: Joi.string().required(),
        port: Joi.number().port().required(),
        password: Joi.string().optional(),
        db: Joi.number().min(0).required(),
        maxRetriesPerRequest: Joi.number().min(1).required()
    }).required(),

    opa: Joi.object({
        url: Joi.string().uri().required(),
        timeout: Joi.number().min(1000).required(),
        policyPath: Joi.string().required()
    }).required(),

    storage: Joi.object({
        endpoint: Joi.string().required(),
        region: Joi.string().required(),
        accessKeyId: Joi.string().required(),
        secretAccessKey: Joi.string().required(),
        defaultBucket: Joi.string().required(),
        versionBucket: Joi.string().required(),
        encryptionKey: Joi.string().min(32).required(),
        archiveVersions: Joi.boolean().required(),
        malwareScan: Joi.boolean().required()
    }).required(),

    security: Joi.object({
        jwtSecret: Joi.string().min(32).required(),
        tokenExpiration: Joi.string().required(),
        bcryptRounds: Joi.number().min(10).max(14).required()
    }).required(),

    logging: Joi.object({
        level: Joi.string().valid('error', 'warn', 'info', 'debug').required(),
        directory: Joi.string().required(),
        maxSize: Joi.string().required(),
        maxFiles: Joi.string().required()
    }).required()
});

export function validateConfig(config: Config): void {
    const { error } = configSchema.validate(config, { abortEarly: false });
    if (error) {
        throw new Error(`Configuration validation failed: ${error.message}`);
    }
} 