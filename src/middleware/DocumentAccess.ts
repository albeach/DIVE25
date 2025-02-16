// Fix evaluateAccess call
const accessResult = await this.opaService.evaluateAccess(
    req.userAttributes,
    {
        documentId: req.params.id,
        clearance: document.clearance,
        releasableTo: document.releasableTo,
        coiTags: document.coiTags,
        lacvCode: document.lacvCode
    }
);

// Add missing methods
private async getRecentFailedAttempts(
    userId: string,
    documentId: string
): Promise < number > {
    // Implementation here
    return 0;
}

private async handleSuspiciousActivity(
    userAttributes: UserAttributes,
    documentId: string,
    failureCount: number
): Promise < void> {
    // Implementation here
} 