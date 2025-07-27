import express from 'express';
import cargoController from '../controllers/cargoController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Rotas públicas para usuários autenticados (leitura)
router.get('/', cargoController.listarCargos);                    // GET /api/cargos - Listar todos os cargos (com busca)
router.get('/nivel/:nivel', cargoController.buscarCargosPorNivel); // GET /api/cargos/nivel/FEDERAL - Cargos por nível
router.get('/:id', cargoController.buscarCargoPorId);             // GET /api/cargos/:id - Detalhes de um cargo
router.get('/unique-names', cargoController.getUniqueCargoNames);

// Rotas administrativas (apenas admins podem criar/editar/deletar)
router.use(requireAdmin);
router.post('/', cargoController.criarCargo);                     // POST /api/cargos - Criar novo cargo
router.put('/:id', cargoController.atualizarCargo);               // PUT /api/cargos/:id - Atualizar cargo
router.delete('/:id', cargoController.deletarCargo);              // DELETE /api/cargos/:id - Deletar cargo

export default router;
