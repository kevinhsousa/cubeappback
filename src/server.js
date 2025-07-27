import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Configuração de variáveis de ambiente
dotenv.config();

// Rotas
import authRoutes from './routers/auth.js';
import candidateRoutes from './routers/candidates.js';
import cargoRoutes from './routers/cargos.js';
import dashboardRoutes from './routers/dashboard.js';
import sentimentoRoutes from './routers/sentimento.js';
import viabilidadeRoutes from './routers/viabilidade.js';
import macrorregiaoRoutes from './routers/macrorregioes.js'; 
import simuladorCenariosRoutes from './routers/simuladorCenarios.js';


import dominioRoutes from './routers/dominio.js';
import userRoutes from './routers/user.js';
import rssRoutes from './routers/rss.js';

// Middlewares
import { errorHandler } from './middleware/errorHandler.js';

// Jobs e Services
import { 
    processarComentariosPublicacao,
    processarProximoCandidatoComentarios,
    obterEstatisticasComentarios 
} from './services/comentariosService.js';
import { 
    iniciarCronjobScraping, 
    executarScraping as executarScrapingAutomatico,
    executarScrapingPorCandidato,
    executarScrapingComentarios,
    iniciarCronjobComentarios
} from './jobs/scrapingCronjob.js';

// Inicialização do app
const app = express();
const prisma = new PrismaClient();

// Iniciar cronjobs automáticos
// iniciarCronjobScraping(); 

const PORT = process.env.PORT || 10000;

// Middlewares
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: [
    'http://localhost:5173', // desenvolvimento local
    'https://cubeapp-omega.vercel.app', // produção Vercel
    process.env.FRONTEND_URL || 'http://localhost:5173'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/cargos', cargoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sentimento', sentimentoRoutes);
app.use('/api/viabilidade', viabilidadeRoutes);
app.use('/api/rss', rssRoutes);
app.use('/api/dominios', dominioRoutes);
app.use('/api/users', userRoutes);
app.use('/api/macrorregioes', macrorregiaoRoutes);
app.use('/api/simulador-cenarios', simuladorCenariosRoutes);

// 📊 Rota para ver status do scraping
app.get('/api/scraping/status', async (req, res) => {
  try {
    const stats = await obterEstatisticasProcessamento();
    const proximoCandidato = await buscarProximoCandidatoParaScraping();
    
    res.json({
      estatisticas: stats,
      proximoCandidato: proximoCandidato ? {
        id: proximoCandidato.id,
        nome: proximoCandidato.nome,
        instagramHandle: proximoCandidato.instagramHandle,
        ultimoScrapingEm: proximoCandidato.ultimoScrapingEm
      } : null
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// 🔄 Scraping automático
app.post('/api/scraping/executar', async (req, res) => {
  try {
    await executarScrapingAutomatico();
    res.json({ 
      sucesso: true, 
      mensagem: 'Scraping automático executado com sucesso' 
    });
  } catch (error) {
    res.status(500).json({ 
      sucesso: false, 
      erro: error.message 
    });
  }
});

// 🎯 Scraping de um candidato específico
app.post('/api/scraping/candidato/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        sucesso: false,
        erro: 'ID do candidato é obrigatório'
      });
    }
    const resultado = await executarScrapingPorCandidato(id);
    res.json({
      sucesso: true,
      mensagem: `Scraping executado para ${resultado.candidato.nome}`,
      dados: resultado
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// 💬 Processar comentários de uma publicação
app.post('/api/comentarios/publicacao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await processarComentariosPublicacao(id);
    res.json({
      sucesso: true,
      mensagem: `Comentários coletados para ${resultado.publicacao.shortCode}`,
      dados: resultado
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// 📋 Listar candidatos
app.get('/api/candidatos', async (req, res) => {
  try {
    const candidatos = await prisma.candidato.findMany({
      where: { 
        ativo: true,
        instagramHandle: { not: null }
      },
      select: {
        id: true,
        nome: true,
        instagramHandle: true,
        ultimoScrapingEm: true,
        followersCount: true,
        verified: true
      },
      orderBy: { nome: 'asc' }
    });
    res.json({
      total: candidatos.length,
      candidatos
    });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Middleware de tratamento de erros
app.use(errorHandler);

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.originalUrl 
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Ambiente: ${process.env.NODE_ENV}`);
});
