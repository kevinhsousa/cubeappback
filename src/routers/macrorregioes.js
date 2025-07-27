import express from 'express';
import macrorregiaoController from '../controllers/macrorregiaoController.js';
import { authenticateToken } from '../middleware/auth.js'; // ✅ USAR authenticateToken como nos outros

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// GET /api/macrorregioes - Listar macrorregiões
router.get('/', macrorregiaoController.index);

export default router;