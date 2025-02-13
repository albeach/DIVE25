import { ObjectId } from 'mongodb';

export interface Document {
  _id?: ObjectId;
  title: string;
  clearance: string;
  releasableTo: string[];
  coiTags?: string[];
  lacvCode?: string;
  metadata: {
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
    version: number;
  };
  content: {
    location: string;
    hash: string;
  };
}

export const ValidClearanceLevels = [
  'UNCLASSIFIED',
  'RESTRICTED',
  'NATO CONFIDENTIAL',
  'NATO SECRET',
  'COSMIC TOP SECRET'
] as const;

export const ValidReleasabilityMarkers = [
  'NATO',
  'EU',
  'FVEY',
  'PARTNERX'
] as const;

export const ValidCoiTags = [
  'OpAlpha',
  'OpBravo',
  'OpGamma',
  'MissionX',
  'MissionZ'
] as const;

export const ValidLacvCodes = [
  'LACV001',
  'LACV002',
  'LACV003',
  'LACV004'
] as const;