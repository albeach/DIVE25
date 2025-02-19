export class DocumentController {
    // Fix 1: Resource attributes in access check
    async checkAccess(req: Request, res: Response) {
        const resourceAttr: ResourceAttributes = {
            path: req.path,
            method: req.method,
            classification: req.document.classification,  // Changed from clearance
            releasableTo: req.document.releasableTo,
            coiTags: req.document.coiTags,
            lacvCode: req.document.lacvCode
        };

        const userAttr: UserAttributes = {
            clearance: req.user.clearance,  // Clearance stays in UserAttributes
            countryOfAffiliation: req.user.countryOfAffiliation,
            coiTags: req.user.coiTags,
            lacvCode: req.user.lacvCode,
            caveats: req.user.caveats
        };

        // ... rest of method
    }

    // Fix 2: Document listing attributes
    async listDocuments(req: Request, res: Response) {
        const resourceAttr: ResourceAttributes = {
            path: '/documents',
            method: 'GET',
            classification: 'UNCLASSIFIED',  // Base classification for listing
            releasableTo: ['NATO'],
            // ... other properties if needed
        };

        // ... rest of method
    }

    // Fix 3: Document access check
    async getDocument(req: Request, res: Response) {
        const { id } = req.params;
        const doc = await Document.findById(id);

        const resourceAttr: ResourceAttributes = {
            path: `/documents/${id}`,
            method: 'GET',
            classification: doc.classification,
            releasableTo: doc.releasableTo,
            coiTags: doc.coiTags,
            lacvCode: doc.lacvCode
        };

        // ... rest of method
    }

    // Fix metadata property access
    async updateDocumentMetadata(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const updates = req.body;

            const updatedDoc = await Document.findByIdAndUpdate(
                id,
                {
                    $set: {
                        ...updates,
                        'metadata.lastModifiedAt': new Date(),
                        'metadata.lastModifiedBy': req.user.id,
                        'metadata.version': updates.metadata?.version || 1
                    }
                },
                { new: true, runValidators: true }
            );

            if (!updatedDoc) {
                throw new DocumentError('Document not found', 404);
            }

            // Return only the metadata part of the document
            const metadata = {
                createdBy: updatedDoc.metadata.createdBy,
                createdAt: updatedDoc.metadata.createdAt,
                lastModifiedBy: updatedDoc.metadata.lastModifiedBy,
                lastModifiedAt: updatedDoc.metadata.lastModifiedAt,
                version: updatedDoc.metadata.version,
                checksum: updatedDoc.metadata.checksum,
                mimeType: updatedDoc.metadata.mimeType,
                size: updatedDoc.metadata.size
            };

            res.json(metadata);
        } catch (error) {
            logger.error('Error updating document metadata:', error);
            if (error instanceof DocumentError) {
                res.status(error.statusCode).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }
} 