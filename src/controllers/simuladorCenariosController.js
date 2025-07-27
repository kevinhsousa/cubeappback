import { 
    simularCenariosCandidato,
    obterSimulacoesPorCargo,
    processarSimulacoesPendentes,
    obterEstatisticasSimulacoes
} from '../services/simuladorCenariosService.js';

const simuladorCenariosController = {
    /**
     * 🎯 Simular cenários para um candidato específico
     */
    async simularCandidato(req, res) {
        try {
            const { candidatoId } = req.params;
            
            if (!candidatoId) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'ID do candidato é obrigatório'
                });
            }

            const resultado = await simularCenariosCandidato(candidatoId);
            
            if (!resultado) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Simulador aplicável apenas a cargos Federal/Estadual'
                });
            }

            res.json({
                sucesso: true,
                dados: resultado,
                mensagem: `Cenários simulados: O:${resultado.cenarioOtimista}% R:${resultado.cenarioRealista}% P:${resultado.cenarioPessimista}%`
            });
            
        } catch (error) {
            console.error('❌ Erro no controller de simulador:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * 📊 Obter tabelas por cargo (formato do documento)
     */
    async obterTabelasPorCargo(req, res) {
        try {
            const tabelas = await obterSimulacoesPorCargo();
            
            res.json({
                sucesso: true,
                dados: tabelas,
                mensagem: `Tabelas: ${tabelas.metadados.totalFederal} Federal, ${tabelas.metadados.totalEstadual} Estadual`
            });
            
        } catch (error) {
            console.error('❌ Erro ao obter tabelas:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * 🔄 Processar simulações pendentes
     */
    async processarPendentes(req, res) {
        try {
            const resultado = await processarSimulacoesPendentes();
            
            res.json({
                sucesso: true,
                dados: resultado,
                mensagem: `Processadas ${resultado.processados} simulações de cenários`
            });
            
        } catch (error) {
            console.error('❌ Erro ao processar pendentes:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * 📊 Estatísticas das simulações
     */
    async estatisticas(req, res) {
        try {
            const stats = await obterEstatisticasSimulacoes();
            
            res.json({
                sucesso: true,
                dados: stats,
                mensagem: `${stats.total} simulações processadas`
            });
            
        } catch (error) {
            console.error('❌ Erro ao obter estatísticas:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    }
};

export default simuladorCenariosController;