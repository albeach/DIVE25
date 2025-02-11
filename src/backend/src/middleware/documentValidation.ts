import { Request, Response, NextFunction } from 'express';
import { ValidClearanceLevels, ValidReleasabilityMarkers, ValidCoiTags, ValidLacvCodes } from '../models/Document';

export const validateDocument = (req: Request, res: Response, next: NextFunction) => {
  const { clearance, releasableTo, coiTags, lacvCode } = req.body;

  // Validate clearance
  if (!ValidClearanceLevels.includes(clearance)) {
    return res.status(400).json({
      error: 'Invalid clearance level',
      validLevels: ValidClearanceLevels
    });
  }

  // Validate releasability
  if (!Array.isArray(releasableTo) || !releasableTo.every(marker => 
    ValidReleasabilityMarkers.includes(marker))) {
    return res.status(400).json({
      error: 'Invalid releasability markers',
      validMarkers: ValidReleasabilityMarkers
    });
  }

  // Validate COI tags if present
  if (coiTags && (!Array.isArray(coiTags) || !coiTags.every(tag => 
    ValidCoiTags.includes(tag)))) {
    return res.status(400).json({
      error: 'Invalid COI tags',
      validTags: ValidCoiTags
    });
  }

  // Validate LACV code if present
  if (lacvCode && !ValidLacvCodes.includes(lacvCode)) {
    return res.status(400).json({
      error: 'Invalid LACV code',
      validCodes: ValidLacvCodes
    });
  }

  next();
};