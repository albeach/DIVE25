import Joi from 'joi';
import { SECURITY_CONSTANTS } from '../constants/security';

export const documentSchemas = {
    create: Joi.object({
        title: Joi.string().required().min(3).max(200),
        description: Joi.string().optional(),
        classification: Joi.string()
            .valid(...Object.keys(SECURITY_CONSTANTS.CLEARANCE_LEVELS))
            .required(),
        releasableTo: Joi.array()
            .items(Joi.string().valid(...SECURITY_CONSTANTS.VALID_RELEASABILITY_MARKERS))
            .required(),
        coiTags: Joi.array()
            .items(Joi.string().valid(...SECURITY_CONSTANTS.VALID_COI_TAGS))
            .optional(),
        lacvCode: Joi.string()
            .valid(...SECURITY_CONSTANTS.VALID_LACV_CODES)
            .optional(),
        content: Joi.string().required().max(10000000), // 10MB limit
        metadata: Joi.object({
            author: Joi.string().required(),
            version: Joi.number().default(1),
            lastModifiedBy: Joi.string().required()
        }).required()
    }),

    update: Joi.object({
        title: Joi.string().min(3).max(200).optional(),
        description: Joi.string().optional(),
        classification: Joi.string()
            .valid(...Object.keys(SECURITY_CONSTANTS.CLEARANCE_LEVELS))
            .optional(),
        releasableTo: Joi.array()
            .items(Joi.string().valid(...SECURITY_CONSTANTS.VALID_RELEASABILITY_MARKERS))
            .optional(),
        coiTags: Joi.array()
            .items(Joi.string().valid(...SECURITY_CONSTANTS.VALID_COI_TAGS))
            .optional(),
        lacvCode: Joi.string()
            .valid(...SECURITY_CONSTANTS.VALID_LACV_CODES)
            .optional(),
        content: Joi.string().max(10000000).optional(), // 10MB limit
        metadata: Joi.object({
            lastModifiedBy: Joi.string().required(),
            version: Joi.number().greater(Joi.ref('$currentVersion')).required()
        }).optional()
    }),

    getById: Joi.object({
        id: Joi.string().required().hex().length(24),
        download: Joi.boolean().optional()
    }),

    delete: Joi.object({
        id: Joi.string().required().hex().length(24)
    }),

    list: Joi.object({
        classification: Joi.string()
            .valid('UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET')
            .optional(),
        coiTags: Joi.alternatives()
            .try(
                Joi.string(),
                Joi.array().items(Joi.string())
            )
            .optional(),
        status: Joi.string()
            .valid('DRAFT', 'PUBLISHED', 'ARCHIVED')
            .optional(),
        page: Joi.number().min(1).optional(),
        limit: Joi.number().min(1).max(100).optional()
    }),

    createVersion: Joi.object({
        file: Joi.object({
            fieldname: Joi.string().required(),
            originalname: Joi.string().required(),
            encoding: Joi.string().required(),
            mimetype: Joi.string().required(),
            buffer: Joi.binary().required(),
            size: Joi.number().max(10 * 1024 * 1024)
        }).required(),
        comment: Joi.string().optional()
    }),

    listVersions: Joi.object({
        id: Joi.string().required().hex().length(24)
    })
}; 