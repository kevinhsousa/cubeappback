import express from 'express';
import viabilidadeController from '../controllers/viabilidadeController.js';

const router = express.Router();

// 📊 Estatísticas para dashboard
router.get('/estatisticas', viabilidadeController.estatisticas);

// 📋 Status dos candidatos pendentes
router.get('/pendentes/status', viabilidadeController.statusPendentes);

// ℹ️ Informações sobre métodos
router.get('/metodos/info', viabilidadeController.infoMetodos);

// 🔍 Obter análise específica de um candidato
router.get('/candidato/:candidatoId', viabilidadeController.obterAnalise);

// 🎯 Analisar candidato específico
router.post('/analisar/:candidatoId', viabilidadeController.analisarCandidato);

// 🔄 Processar análises pendentes
router.post('/processar-pendentes', viabilidadeController.processarPendentes);

// 🧹 Limpar análises antigas
router.delete('/limpar-antigas', viabilidadeController.limparAntigas);

export default router;