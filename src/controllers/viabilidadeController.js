import { 
    analisarViabilidadeCandidato,
    obterEstatisticasViabilidade,
    processarViabilidadesPendentes,
    obterAnaliseViabilidade,
    limparAnalisesAntigas,
    listarCandidatosPendentes
} from '../services/viabilidadeService.js';

const viabilidadeController = {
    /**
     * 🎯 Analisar viabilidade de um candidato específico
     */
    async analisarCandidato(req, res) {
        try {
            const { candidatoId } = req.params;
            
            if (!candidatoId) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'ID do candidato é obrigatório'
                });
            }

            console.log(`📊 Solicitação de análise para candidato: ${candidatoId}`);

            const resultado = await analisarViabilidadeCandidato(candidatoId);
            
            const metodo = resultado.geminiModel === 'score-cube-v2.0' ? 'Score Cube v2.0' : 'IA Qualitativa v2.0';
            
            res.json({
                sucesso: true,
                dados: {
                    ...resultado,
                    metodoUsado: metodo
                },
                mensagem: `Análise de viabilidade concluída via ${metodo}`
            });
            
        } catch (error) {
            console.error('❌ Erro no controller de viabilidade:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message,
                detalhes: 'Erro interno no processamento da análise'
            });
        }
    },

    /**
     * 📊 Obter estatísticas para dashboard
     */
    async estatisticas(req, res) {
        try {
            const { candidatoIds, cargoIds } = req.query;
            
            // Parse dos IDs se fornecidos
            const candidatoIdsArray = candidatoIds ? candidatoIds.split(',').filter(Boolean) : null;
            const cargoIdsArray = cargoIds ? cargoIds.split(',').filter(Boolean) : null;

            const stats = await obterEstatisticasViabilidade(candidatoIdsArray, cargoIdsArray);
            
            res.json({
                sucesso: true,
                dados: stats,
                mensagem: `Estatísticas de ${stats.totalProcessados} candidatos analisados`
            });
            
        } catch (error) {
            console.error('❌ Erro ao obter estatísticas de viabilidade:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * 🔄 Processar análises pendentes
     */
    async processarPendentes(req, res) {
        try {
            console.log('🔄 Iniciando processamento de viabilidades pendentes...');
            
            const resultado = await processarViabilidadesPendentes();
            
            const mensagem = resultado.processadas > 0 
                ? `Processadas ${resultado.processadas} análises de viabilidade (${resultado.erros} erros)`
                : 'Nenhuma análise pendente encontrada';

            res.json({
                sucesso: true,
                dados: resultado,
                mensagem
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
     * 🔍 Obter análise específica de um candidato
     */
    async obterAnalise(req, res) {
        try {
            const { candidatoId } = req.params;
            
            if (!candidatoId) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'ID do candidato é obrigatório'
                });
            }

            const analise = await obterAnaliseViabilidade(candidatoId);
            
            if (!analise) {
                return res.status(404).json({
                    sucesso: false,
                    erro: 'Nenhuma análise de viabilidade encontrada para este candidato'
                });
            }

            res.json({
                sucesso: true,
                dados: analise,
                mensagem: `Análise encontrada via ${analise.metodoUsado}`
            });
            
        } catch (error) {
            console.error('❌ Erro ao obter análise:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * 📋 Status dos candidatos pendentes (para debug)
     */
    async statusPendentes(req, res) {
        try {
            const pendentes = await listarCandidatosPendentes();
            
            res.json({
                sucesso: true,
                dados: pendentes,
                mensagem: `${pendentes.total} candidatos pendentes para análise`
            });
            
        } catch (error) {
            console.error('❌ Erro ao listar pendentes:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * 🧹 Limpar análises antigas
     */
    async limparAntigas(req, res) {
        try {
            const { dias = 30 } = req.query;
            const diasNum = parseInt(dias, 10);
            
            if (isNaN(diasNum) || diasNum < 1) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Parâmetro "dias" deve ser um número maior que 0'
                });
            }

            const removidas = await limparAnalisesAntigas(diasNum);
            
            res.json({
                sucesso: true,
                dados: { removidas, diasParaManter: diasNum },
                mensagem: `${removidas} análises antigas removidas`
            });
            
        } catch (error) {
            console.error('❌ Erro na limpeza:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    /**
     * ℹ️ Informações sobre os métodos de análise
     */
    async infoMetodos(req, res) {
        try {
            const info = {
                scoreCube: {
                    versao: '2.0',
                    descricao: 'Cálculo quantitativo baseado em fórmula específica',
                    escopo: 'Candidatos a cargos Federal e Estadual',
                    parametros: [
                        'Taxa de Engajamento (TE)',
                        'Votos última eleição (para veteranos)',
                        'Interações médias (para estreantes)',
                        'I_ref por nível (Federal: 1476.58, Estadual: 587.88)'
                    ],
                    formula: {
                        veterano: 'SCORE = (0.5 × R_V + 0.5 × R_E) × 100',
                        estreante: 'SCORE = (0.5 × R_I + 0.5 × R_E) × 100'
                    }
                },
                iaQualitativa: {
                    versao: '2.0',
                    descricao: 'Análise via IA considerando contexto político',
                    escopo: 'Candidatos a cargos Municipal, Distrital e outros',
                    modelo: 'Gemini 1.5 Flash',
                    fatores: [
                        'Dados demográficos',
                        'Penetração digital',
                        'Análises de sentimento',
                        'Contexto político atual'
                    ]
                }
            };

            res.json({
                sucesso: true,
                dados: info,
                mensagem: 'Informações sobre os métodos de análise de viabilidade'
            });
            
        } catch (error) {
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    }
};

export default viabilidadeController;