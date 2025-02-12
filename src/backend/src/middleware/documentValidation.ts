// src/backend/src/middleware/documentValidation.ts

import { Request, Response, NextFunction } from 'express';
import { Classification, ValidReleasabilityMarkers, ValidCoiTags } from '../models/Document';
import { LoggerService } from '../services/LoggerService';

const logger = LoggerService.getInstance();

export function validateDocumentMetadata(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.body.metadata) {
            return res.status(400).json({
                error: 'Document metadata is required'
            });
        }

        const metadata = JSON.parse(req.body.metadata);

        // Validate required metadata fields
        const requiredFields = ['title', 'classification'];
        const missingFields = requiredFields.filter(field => !metadata[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: 'Missing required metadata fields',
                missingFields
            });
        }

        // Validate classification level
        if (!Object.values(Classification).includes(metadata.classification)) {
            return res.status(400).json({
                error: 'Invalid classification level',
                validLevels: Object.values(Classification)
            });
        }

        // Validate releasability markers if provided
        if (metadata.releasability) {
            if (!Array.isArray(metadata.releasability)) {
                return res.status(400).json({
                    error: 'Releasability must be an array'
                });
            }

            const invalidMarkers = metadata.releasability.filter(
                marker => !ValidReleasabilityMarkers.includes(marker)
            );

            if (invalidMarkers.length > 0) {
                return res.status(400).json({
                    error: 'Invalid releasability markers',
                    invalidMarkers,
                    validMarkers: ValidReleasabilityMarkers
                });
            }
        }

        // Validate COI tags if provided
        if (metadata.coiTags) {
            if (!Array.isArray(metadata.coiTags)) {
                return res.status(400).json({
                    error: 'COI tags must be an array'
                });
            }

            const invalidTags = metadata.coiTags.filter(
                tag => !ValidCoiTags.includes(tag)
            );

            if (invalidTags.length > 0) {
                return res.status(400).json({
                    error: 'Invalid COI tags',
                    invalidTags,
                    validTags: ValidCoiTags
                });
            }
        }

        // Validate LACV code format if provided
        if (metadata.lacvCode && !/^LACV\d{3}$/.test(metadata.lacvCode)) {
            return res.status(400).json({
                error: 'Invalid LACV code format. Must match pattern: LACV followed by 3 digits'
            });
        }

        // Enhance metadata with additional security checks
        metadata.security = {
            classification: metadata.classification,
            caveats: metadata.caveats || [],
            releasability: metadata.releasability || [],
            coiTags: metadata.coiTags || [],
            lacvCode: metadata.lacvCode
        };

        // Add audit information
        metadata.audit = {
            uploadedAt: new Date(),
            uploadedBy: req.userAttributes.uniqueIdentifier,
            organizationalAffiliation: req.userAttributes.organizationalAffiliation
        };

        // Store enhanced metadata back in request
        req.body.metadata = JSON.stringify(metadata);
        
        logger.info('Document metadata validated successfully', {
            classification: metadata.classification,
            uploader: req.userAttributes.uniqueIdentifier
        });

        next();
    } catch (error) {
        logger.error('Document metadata validation error', { error });
        res.status(400).json({
            error: 'Invalid metadata format',
            details: error.message
        });
    }
}