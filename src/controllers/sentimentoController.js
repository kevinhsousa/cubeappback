// controllers/sentimentoController.js
import { 
    analisarSentimentoComentarios,
    obterEstatisticasSentimento,
    processarAnalisesSentimentoPendentes
} from '../services/sentimentoService.js';

const sentimentoController = {
    // Analisar sentimento de uma publicação específica
    async analisarPublicacao(req, res) {
        try {
            const { publicacaoId } = req.params;
            
            if (!publicacaoId) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'ID da publicação é obrigatório'
                });
            }

            const resultado = await analisarSentimentoComentarios(publicacaoId);
            
            res.json({
                sucesso: true,
                dados: resultado,
                mensagem: 'Análise de sentimento concluída'
            });
            
        } catch (error) {
            console.error('Erro no controller de sentimento:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    // Obter estatísticas para dashboard
    async estatisticas(req, res) {
        try {
            const stats = await obterEstatisticasSentimento();
            
            res.json({
                sucesso: true,
                dados: stats
            });
            
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    },

    // Processar análises pendentes
    async processarPendentes(req, res) {
        try {
            const resultado = await processarAnalisesSentimentoPendentes();
            
            res.json({
                sucesso: true,
                dados: resultado,
                mensagem: `Processadas ${resultado.processadas} análises`
            });
            
        } catch (error) {
            console.error('Erro ao processar pendentes:', error);
            res.status(500).json({
                sucesso: false,
                erro: error.message
            });
        }
    }
};

export default sentimentoController;