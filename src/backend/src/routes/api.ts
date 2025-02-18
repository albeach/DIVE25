import express from 'express';
import { DocumentController, PartnerController } from '../controllers';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

const auth = AuthMiddleware.getInstance().authenticate;
const router = express.Router();

// Partner endpoints
router.post('/partners/register', auth, async (req, res) => {
    const controller = new PartnerController();
    const partner = await controller.registerPartner(req.body);
    res.status(201).json(partner);
});

router.get('/partners', auth, async (req, res) => {
    const controller = new PartnerController();
    const partners = await controller.getPartners();
    res.json(partners);
});

// Document endpoints
router.post('/documents', auth, async (req, res) => {
    const controller = new DocumentController();
    const document = await controller.createDocument(req.body);
    res.status(201).json(document);
});

router.get('/documents', auth, async (req, res) => {
    const controller = new DocumentController();
    const documents = await controller.getDocuments(req.query);
    res.json(documents);
});

router.get('/documents/:id', auth, async (req, res) => {
    const controller = new DocumentController();
    const document = await controller.getDocument(req.params.id);
    res.json(document);
});

export default router; 