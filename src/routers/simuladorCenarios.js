import express from 'express';
import simuladorCenariosController from '../controllers/simuladorCenariosController.js';

const router = express.Router();

// 📊 Estatísticas das simulações
router.get('/estatisticas', simuladorCenariosController.estatisticas);

// 📊 Tabelas por cargo (formato documento)
router.get('/tabelas-por-cargo', simuladorCenariosController.obterTabelasPorCargo);

// 🎯 Simular cenários para candidato específico
router.post('/simular/:candidatoId', simuladorCenariosController.simularCandidato);

router.get('/simular/:candidatoId', simuladorCenariosController.simularCandidato);

// 🔄 Processar simulações pendentes
router.post('/processar-pendentes', simuladorCenariosController.processarPendentes);

export default router;