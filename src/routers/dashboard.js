import express from 'express';
import dashboardController from '../controllers/dashboardController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Aplicar autenticação em todas as rotas
// router.use(authenticateToken);

// Rotas específicas do dashboard
router.get('/metricas', dashboardController.metricas);
router.get('/redes-sociais', dashboardController.redesSociais);
router.get('/viabilidade', dashboardController.viabilidade);
router.get('/nuvem-palavras', dashboardController.nuvemPalavras);
router.get('/estatisticas-gerais', dashboardController.estatisticasGerais);
router.get('/filtros', dashboardController.filtros);
router.get('/candidatos', dashboardController.listarCandidatos);

// Rota principal que retorna tudo
router.get('/', dashboardController.index);

export default router;