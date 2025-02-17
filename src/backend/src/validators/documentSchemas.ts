import Joi from 'joi';

export const documentSchemas = {
    create: Joi.object({
        title: Joi.string().required(),
        description: Joi.string().optional(),
        classification: Joi.string()
            .valid('UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET')
            .required(),
        releasableTo: Joi.array()
            .items(Joi.string().valid('NATO', 'FVEY', 'EU', 'PARTNERX'))
            .required(),
        coiTags: Joi.array()
            .items(Joi.string().valid('OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'))
            .optional(),
        lacvCode: Joi.string().optional(),
        file: Joi.object({
            fieldname: Joi.string().required(),
            originalname: Joi.string().required(),
            encoding: Joi.string().required(),
            mimetype: Joi.string().required(),
            buffer: Joi.binary().required(),
            size: Joi.number().max(10 * 1024 * 1024) // 10MB limit
        }).required()
    }),

    update: Joi.object({
        title: Joi.string().optional(),
        description: Joi.string().optional(),
        classification: Joi.string()
            .valid('UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET')
            .optional(),
        releasableTo: Joi.array()
            .items(Joi.string().valid('NATO', 'FVEY', 'EU', 'PARTNERX'))
            .optional(),
        coiTags: Joi.array()
            .items(Joi.string().valid('OpAlpha', 'OpBravo', 'OpGamma', 'MissionX', 'MissionZ'))
            .optional(),
        lacvCode: Joi.string().optional(),
        file: Joi.object({
            fieldname: Joi.string().required(),
            originalname: Joi.string().required(),
            encoding: Joi.string().required(),
            mimetype: Joi.string().required(),
            buffer: Joi.binary().required(),
            size: Joi.number().max(10 * 1024 * 1024)
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