import express from 'express';
import candidateController from '../controllers/candidateController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Rotas específicas (devem vir antes das rotas com parâmetros)
router.get('/search', candidateController.index);              
router.get('/by-cargo/:cargo', candidateController.index);     
router.get('/stats', candidateController.stats);               

// Rotas de insights (devem vir antes das rotas gerais com :id)
router.get('/:id/insights', candidateController.getInsights);  // Listar insights do candidato

// Rota para buscar publicações do candidato
router.get('/:id/publicacoes', candidateController.getPublicacoes); // Buscar publicações do candidato

// Rota para buscar sentimentos do candidato
router.get('/:id/sentimentos', candidateController.getSentimentos); // Buscar sentimentos do candidato

// Rotas gerais
router.get('/', candidateController.index);                    
router.get('/:id', candidateController.show);                  

// Rotas administrativas (apenas admins podem criar/editar/deletar)
router.use(requireAdmin);
router.post('/', candidateController.store);           
router.put('/:id', candidateController.update);        
router.delete('/:id', candidateController.destroy);    // Inativar
router.put('/:id/reactivate', candidateController.reactivate); // Reativar

// Rotas de insights administrativas
router.post('/:id/insights', candidateController.createInsight);                    // Criar insight
router.put('/:candidateId/insights/:insightId', candidateController.updateInsight); // Atualizar insight
router.delete('/:candidateId/insights/:insightId', candidateController.deleteInsight); // Deletar insight


export default router;