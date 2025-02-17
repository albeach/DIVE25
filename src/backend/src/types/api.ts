/**
 * @openapi
 * components:
 *   schemas:
 *     Partner:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         country:
 *           type: string
 *         status:
 *           type: string
 *           enum: [ACTIVE, PENDING, INACTIVE]
 *         clearanceLevel:
 *           type: string
 *         authorizedCOIs:
 *           type: array
 *           items:
 *             type: string
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         classification:
 *           type: string
 *         metadata:
 *           type: object
 *         coiTags:
 *           type: array
 *           items:
 *             type: string
 */

/**
 * @openapi
 * /api/partners:
 *   get:
 *     summary: Get all partners
 *     tags: [Partners]
 *     responses:
 *       200:
 *         description: List of partners
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Partner'
 * 
 *   post:
 *     summary: Create a new partner
 *     tags: [Partners]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Partner'
 *     responses:
 *       201:
 *         description: Partner created
 * 
 * /api/documents:
 *   get:
 *     summary: Get all documents
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: classification
 *         schema:
 *           type: string
 *       - in: query
 *         name: coiTags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 */ 