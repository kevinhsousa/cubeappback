import express from 'express';
import rssController from '../controllers/rssController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Rota para testar conectividade (pública - útil para monitoramento)
router.get('/test', rssController.testConnection);

// Rota para listar feeds disponíveis (pública)
router.get('/feeds', rssController.getAvailableFeeds);

// Rota para buscar notícias do Google News (protegida)
router.get('/google-news', authenticateToken, rssController.getGoogleNews);

// Rota para buscar notícias por categoria (protegida)
router.get('/category/:category', authenticateToken, rssController.getNewsByCategory);

// Rota para RSS customizado (protegida)
router.post('/custom', authenticateToken, rssController.getCustomRSS);


export default router;