export const SECURITY_CONSTANTS = {
    CLEARANCE_LEVELS: {
        'UNCLASSIFIED': 0,
        'RESTRICTED': 1,
        'NATO CONFIDENTIAL': 2,
        'NATO SECRET': 3,
        'COSMIC TOP SECRET': 4
    } as const,

    VALID_RELEASABILITY_MARKERS: [
        'NATO',
        'ISAF',
        'KFOR',
        'EU'
    ] as const,

    VALID_COI_TAGS: [
        'OpAlpha',
        'OpBravo',
        'OpGamma',
        'MissionX',
        'MissionZ'
    ] as const,

    VALID_LACV_CODES: [
        'LACV001',
        'LACV002',
        'LACV003',
        'LACV004'
    ] as const
};

export type ClearanceLevel = keyof typeof SECURITY_CONSTANTS.CLEARANCE_LEVELS;
export type ReleasabilityMarker = typeof SECURITY_CONSTANTS.VALID_RELEASABILITY_MARKERS[number];
export type CoiTag = typeof SECURITY_CONSTANTS.VALID_COI_TAGS[number];
export type LacvCode = typeof SECURITY_CONSTANTS.VALID_LACV_CODES[number]; 