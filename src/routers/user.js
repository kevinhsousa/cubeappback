import  express from 'express';
import  userController from '../controllers/userController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/first-user', userController.firstUser);

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Rotas que NÃO requerem admin (usuários podem acessar seus próprios dados)
router.get('/:id', userController.show);           // GET /api/users/:id - Buscar usuário específico
router.put('/:id', userController.update);         // PUT /api/users/:id - Atualizar perfil
router.put('/:id/password', userController.changePassword); // PUT /api/users/:id/password - Alterar senha

// Rotas que REQUEREM admin
router.use(requireAdmin); // A partir daqui, todas as rotas requerem admin

router.get('/', userController.index);             // GET /api/users - Listar usuários
router.post('/', userController.store);            // POST /api/users - Criar usuário
router.delete('/:id', userController.destroy);     // DELETE /api/users/:id - Deletar usuário

export default router;