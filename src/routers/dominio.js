import  express from  'express';
import  dominioController from  '../controllers/dominioController.js';
import  { authenticateToken, requireAdmin } from  '../middleware/auth.js';

const router = express.Router();

// ============================================
// ROTAS PÚBLICAS (para sugestões no frontend)
// ============================================

// Listar domínios (público - para sugestões)
router.get('/', dominioController.listarDominios);

// ============================================
// ROTAS ADMINISTRATIVAS (requerem admin)
// ============================================

// Obter domínio específico por ID
router.get('/:id', authenticateToken, requireAdmin, dominioController.obterDominio);

// Criar novo domínio
router.post('/', authenticateToken, requireAdmin, dominioController.criarDominio);

// Atualizar domínio
router.put('/:id', authenticateToken, requireAdmin, dominioController.atualizarDominio);

// Deletar domínio
router.delete('/:id', authenticateToken, requireAdmin, dominioController.deletarDominio);

// Verificar funcionamento de um domínio específico
router.post('/:id/verificar', authenticateToken, requireAdmin, dominioController.verificarDominio);

// Importar domínios em lote
router.post('/importar', authenticateToken, requireAdmin, dominioController.importarDominios);

// Prévia de como o domínio será processado
router.post('/preview', authenticateToken, dominioController.previewDominio);

export default router;