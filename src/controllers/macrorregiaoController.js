import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const macrorregiaoController = {
  // GET /api/macrorregioes - Listar todas as macrorregiões
  async listarMacrorregioes(req, res) {
    try {
      
      const macrorregioes = await prisma.macrorregiao.findMany({
        orderBy: { nome: 'asc' }
      });
      
      
      res.json({
        success: true,
        data: macrorregioes,
        total: macrorregioes.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar macrorregiões:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: error.message
      });
    }
  },

  //  CORRIGIDO - Alias para compatibilidade
  async index(req, res) {
    return macrorregiaoController.listarMacrorregioes(req, res);
  }
};

export default macrorregiaoController;