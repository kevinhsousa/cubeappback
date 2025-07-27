// routers/sentimento.js
import express from 'express';
import sentimentoController from '../controllers/sentimentoController.js';

const router = express.Router();

// Estatísticas para dashboard
router.get('/estatisticas', sentimentoController.estatisticas);

// Processar análises pendentes
router.post('/processar-pendentes', sentimentoController.processarPendentes);

// Analisar publicação específica
router.post('/analisar/:publicacaoId', sentimentoController.analisarPublicacao);

export default router;