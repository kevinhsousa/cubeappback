// controllers/dashboardController.js
import { PrismaClient } from '@prisma/client';
import { obterEstatisticasSentimento } from '../services/sentimentoService.js';
import { obterEstatisticasViabilidade } from '../services/viabilidadeService.js';

const prisma = new PrismaClient();

const dashboardController = {
  // Rota principal - retorna todas as métricas
  async index(req, res) {
    try {
      // Extrair todos os filtros da query
      const candidatoIds = req.query.candidatos ? req.query.candidatos.split(',') : null;
      const cargoIds = req.query.cargos ? req.query.cargos.split(',') : null;
      const cargoPretendidoIds = req.query.cargosPretendidos ? req.query.cargosPretendidos.split(',') : null;
      const mandatos = req.query.mandatos ? req.query.mandatos.split(',') : null;
      const redutosOrigem = req.query.redutosOrigem ? req.query.redutosOrigem.split(',') : null;
      const macrorregiaoIds = req.query.macrorregioes ? req.query.macrorregioes.split(',') : null;
      
      const dados = {
        redesSociais: await calcularRedesSociais(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds),
        viabilidade: await calcularViabilidade(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds),
        estatisticasGerais: await calcularEstatisticasGerais(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds),
        nuvemPalavras: await gerarDadosNuvemPalavras(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds)
      };

      res.json({
        sucesso: true,
        dados,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Erro no dashboard:', error);
      res.status(500).json({
        sucesso: false,
        erro: 'Erro interno do servidor'
      });
    }
  },

  // Métricas de redes sociais
  async redesSociais(req, res) {
    try {
      const dados = await calcularRedesSociais();
      res.json({ sucesso: true, dados });
    } catch (error) {
      res.status(500).json({ sucesso: false, erro: error.message });
    }
  },

  // Semáforo de viabilidade
  async viabilidade(req, res) {
    try {
      const dados = await calcularViabilidade();
      res.json({ sucesso: true, dados });
    } catch (error) {
      res.status(500).json({ sucesso: false, erro: error.message });
    }
  },

  // Dados para nuvem de palavras
  async nuvemPalavras(req, res) {
    try {
      const dados = await gerarDadosNuvemPalavras();
      res.json({ sucesso: true, dados });
    } catch (error) {
      res.status(500).json({ sucesso: false, erro: error.message });
    }
  },

  // Estatísticas gerais
  async estatisticasGerais(req, res) {
    try {
      const dados = await calcularEstatisticasGerais();
      res.json({ sucesso: true, dados });
    } catch (error) {
      res.status(500).json({ sucesso: false, erro: error.message });
    }
  },

  // Métricas gerais
  async metricas(req, res) {
    try {
      const dados = {
        candidatos: await prisma.candidato.count({ where: { ativo: true } }),
        publicacoes: await prisma.publicacoes.count(),
        comentarios: await prisma.comentarios.count(),
        ultimaAtualizacao: await prisma.candidato.findFirst({
          where: { ultimoScrapingEm: { not: null } },
          orderBy: { ultimoScrapingEm: 'desc' },
          select: { ultimoScrapingEm: true }
        })
      };

      res.json({ sucesso: true, dados });
    } catch (error) {
      res.status(500).json({ sucesso: false, erro: error.message });
    }
  },

  // Filtros para candidatos e cargos - ATUALIZADO COM NOVOS FILTROS
  async filtros(req, res) {
    try {
      const [candidatos, cargos, cargosPretendidos, macrorregioes] = await Promise.all([
        // Candidatos
        prisma.candidato.findMany({
          where: { ativo: true },
          select: {
            id: true,
            nome: true,
            cargoId: true,
            cargo: {
              select: { 
                id: true,
                nome: true,
                nivel: true
              }
            },
            macrorregiao: {
              select: {
                id: true,
                nome: true
              }
            }
          },
          orderBy: { nome: 'asc' }
        }),
        
        // Cargos Atuais
        prisma.cargo.findMany({
          where: { ativo: true },
          select: {
            id: true,
            nome: true,
            nivel: true
          },
          orderBy: { nome: 'asc' }
        }),

        // Cargos Pretendidos (buscar apenas os que estão sendo usados)
        prisma.cargo.findMany({
          where: { 
            ativo: true,
            candidatosPretendidos: {
              some: { ativo: true }
            }
          },
          select: {
            id: true,
            nome: true,
            nivel: true
          },
          orderBy: { nome: 'asc' }
        }),

        // Macrorregiões
        prisma.macrorregiao.findMany({
          where: { ativo: true },
          select: {
            id: true,
            nome: true
          },
          orderBy: { nome: 'asc' }
        })
      ]);

      // Buscar mandatos únicos
      const mandatosResult = await prisma.candidato.groupBy({
        by: ['mandato'],
        where: {
          ativo: true,
          mandato: { not: null }
        }
      });
      const mandatos = mandatosResult
        .map(item => item.mandato)
        .filter(mandato => mandato) // Remove valores null/undefined
        .sort();

      // Buscar redutos de origem únicos
      const redutosResult = await prisma.candidato.groupBy({
        by: ['redutoOrigem'],
        where: {
          ativo: true,
          redutoOrigem: { not: null }
        }
      });
      const redutosOrigem = redutosResult
        .map(item => item.redutoOrigem)
        .filter(reduto => reduto) // Remove valores null/undefined
        .sort();

      res.json({
        sucesso: true,
        dados: {
          candidatos,
          cargos,
          cargosPretendidos,
          mandatos,
          redutosOrigem,
          macrorregioes
        }
      });
    } catch (error) {
      console.error('Erro ao buscar filtros:', error);
      res.status(500).json({
        sucesso: false,
        erro: error.message
      });
    }
  },

  // Listar candidatos com filtros e paginação
  async listarCandidatos(req, res) {
    try {
      // Buscar todos os candidatos sem filtros ou paginação
      const candidates = await prisma.candidato.findMany({
        include: {
          cargo: {
            select: { id: true, nome: true, nivel: true }
          },
          cargoPretendido: {
            select: { id: true, nome: true, nivel: true }
          },
          macrorregiao: {
            select: { id: true, nome: true }
          },
          historicoSeguidores: {
            take: 1,
            orderBy: { dataColeta: 'desc' },
            select: {
              followersCount: true,
              percentualVariacao: true
            }
          },
          viabilidades: {
            take: 1,
            orderBy: { processadoEm: 'desc' },
            select: {
              categoria: true
            }
          }
        },
        orderBy: { nome: 'asc' } // Ordenar por nome para facilitar no frontend
      });

      res.json({
        success: true,
        data: candidates
      });
    } catch (error) {
      console.error('❌ Erro ao listar candidatos no Dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar candidatos'
      });
    }
  }
};

// Funções auxiliares - ATUALIZADAS COM NOVOS FILTROS
async function calcularRedesSociais(candidatoIds = null, cargoIds = null, cargoPretendidoIds = null, mandatos = null, redutosOrigem = null, macrorregiaoIds = null) {
    try {
        // Criar filtro base para candidatos
        const candidatoFilter = criarFiltroCandidatos(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds);
        
        const totalMencoes = await prisma.comentarios.count({
            where: candidatoFilter.publicacao ? {
                publicacao: {
                    candidato: candidatoFilter
                }
            } : undefined
        });
        
        const alcanceResult = await prisma.candidato.aggregate({
            _sum: { followersCount: true },
            where: {
                ativo: true,
                followersCount: { not: null },
                ...candidatoFilter
            }
        });

        const engajamentoResult = await prisma.publicacoes.aggregate({
            _sum: { 
                likesCount: true,
                commentsCount: true 
            },
            where: candidatoFilter.id || candidatoFilter.cargoId || candidatoFilter.cargoPretendidoId || candidatoFilter.mandato || candidatoFilter.redutoOrigem || candidatoFilter.macrorregiaoId ? {
                candidato: candidatoFilter
            } : undefined
        });

        // Dados reais de sentimento filtrados
        const sentimentoReal = await obterEstatisticasSentimento(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds);

        return {
            totalMencoes,
            totalAlcance: alcanceResult._sum.followersCount || 0,
            totalLikes: engajamentoResult._sum.likesCount || 0,
            totalComentarios: engajamentoResult._sum.commentsCount || 0,
            sentimento: sentimentoReal
        };
    } catch (error) {
        console.error('❌ Erro em calcularRedesSociais:', error);
        return {
            totalMencoes: 0,
            totalAlcance: 0,
            totalLikes: 0,
            totalComentarios: 0,
            sentimento: { positivo: 0, negativo: 0, neutro: 0 }
        };
    }
}

async function calcularViabilidade(candidatoIds = null, cargoIds = null, cargoPretendidoIds = null, mandatos = null, redutosOrigem = null, macrorregiaoIds = null) {
    try {
        // Usar dados reais da IA com filtros
        const viabilidadeReal = await obterEstatisticasViabilidade(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds);
        
        // ✅ RETORNAR exatamente o que vem do service
        return viabilidadeReal;
        
    } catch (error) {
        console.error('❌ Erro em calcularViabilidade:', error);
        return {
            total: 0,
            totalProcessados: 0,
            distribuicao: { alta: 0, media: 0, risco: 0, critico: 0 },
            candidatos: []
        };
    }
}

async function calcularEstatisticasGerais(candidatoIds = null, cargoIds = null, cargoPretendidoIds = null, mandatos = null, redutosOrigem = null, macrorregiaoIds = null) {
    try {
        // Criar filtro base
        const candidatoFilter = criarFiltroCandidatos(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds);
        
        const [
            totalCandidatos,
            candidatosAtivos,
            totalPublicacoes,
            totalComentarios,
            ultimoScraping
        ] = await Promise.all([
            prisma.candidato.count({
                where: candidatoFilter
            }),
            prisma.candidato.count({ 
                where: { 
                    ativo: true,
                    ...candidatoFilter
                }
            }),
            prisma.publicacoes.count({
                where: candidatoFilter.id || candidatoFilter.cargoId || candidatoFilter.cargoPretendidoId || candidatoFilter.mandato || candidatoFilter.redutoOrigem || candidatoFilter.macrorregiaoId ? {
                    candidato: candidatoFilter
                } : undefined
            }),
            prisma.comentarios.count({
                where: candidatoFilter.id || candidatoFilter.cargoId || candidatoFilter.cargoPretendidoId || candidatoFilter.mandato || candidatoFilter.redutoOrigem || candidatoFilter.macrorregiaoId ? {
                    publicacao: {
                        candidato: candidatoFilter
                    }
                } : undefined
            }),
            prisma.candidato.findFirst({
                where: { 
                    ultimoScrapingEm: { not: null },
                    ...candidatoFilter
                },
                orderBy: { ultimoScrapingEm: 'desc' },
                select: { ultimoScrapingEm: true, nome: true }
            })
        ]);

        return {
            candidatos: { total: totalCandidatos, ativos: candidatosAtivos },
            conteudo: { publicacoes: totalPublicacoes, comentarios: totalComentarios },
            ultimoScraping: ultimoScraping?.ultimoScrapingEm,
            ultimoCandidatoProcessado: ultimoScraping?.nome
        };
    } catch (error) {
        console.error('❌ Erro em calcularEstatisticasGerais:', error);
        return {
            candidatos: { total: 0, ativos: 0 },
            conteudo: { publicacoes: 0, comentarios: 0 },
            ultimoScraping: null,
            ultimoCandidatoProcessado: null
        };
    }
}

async function gerarDadosNuvemPalavras(candidatoIds = null, cargoIds = null, cargoPretendidoIds = null, mandatos = null, redutosOrigem = null, macrorregiaoIds = null) {
    try {
        
        // Criar filtro para análises de sentimento
        const candidatoFilter = criarFiltroCandidatos(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds);
        
        // Buscar análises de sentimento filtradas
        const analises = await prisma.analisesSentimento.findMany({
            where: {
                resumoInsights: { not: null },
                ...(candidatoFilter.id || candidatoFilter.cargoId || candidatoFilter.cargoPretendidoId || candidatoFilter.mandato || candidatoFilter.redutoOrigem || candidatoFilter.macrorregiaoId ? {
                    candidato: candidatoFilter
                } : {})
            },
            select: {
                resumoInsights: true
            },
            orderBy: { criadoEm: 'desc' },
            take: 100
        });

        if (analises.length === 0) {
            return {
                palavras: [],
                totalTextos: 0,
                totalAnalises: 0
            };
        }

        // Rest of the function remains the same...
        const contadorPalavras = new Map();
        const contadorTemas = new Map();
        let totalTextos = 0;

        analises.forEach(analise => {
            const insights = analise.resumoInsights;
            
            if (insights.palavrasChave && Array.isArray(insights.palavrasChave)) {
                insights.palavrasChave.forEach(palavra => {
                    const palavraLimpa = palavra.toLowerCase().trim();
                    if (palavraLimpa.length > 2) {
                        contadorPalavras.set(palavraLimpa, (contadorPalavras.get(palavraLimpa) || 0) + 1);
                    }
                });
            }

            if (insights.temas && Array.isArray(insights.temas)) {
                insights.temas.forEach(tema => {
                    const palavrasTema = tema.toLowerCase()
                        .replace(/[^\w\s]/g, '')
                        .split(' ')
                        .filter(p => p.length > 3);
                    
                    palavrasTema.forEach(palavra => {
                        contadorTemas.set(palavra, (contadorTemas.get(palavra) || 0) + 1);
                    });
                });
            }

            totalTextos += insights.totalTextos || 1;
        });

        const todasPalavras = new Map();
        
        contadorPalavras.forEach((count, palavra) => {
            todasPalavras.set(palavra, count * 2);
        });

        contadorTemas.forEach((count, palavra) => {
            const pesoAtual = todasPalavras.get(palavra) || 0;
            todasPalavras.set(palavra, pesoAtual + count);
        });

        const palavrasOrdenadas = Array.from(todasPalavras.entries())
            .map(([texto, frequencia]) => ({ texto, frequencia }))
            .sort((a, b) => b.frequencia - a.frequencia)
            .slice(0, 20);

        const maxFrequencia = palavrasOrdenadas[0]?.frequencia || 1;
        const palavrasComPeso = palavrasOrdenadas.map(item => ({
            text: item.texto,
            weight: Math.round((item.frequencia / maxFrequencia) * 100)
        }));

        
        return {
            palavras: palavrasComPeso,
            totalTextos,
            totalAnalises: analises.length
        };

    } catch (error) {
        console.error('❌ Erro ao gerar nuvem de palavras:', error.message);
        return {
            palavras: [],
            totalTextos: 0,
            totalAnalises: 0
        };
    }
}

// FUNÇÃO ATUALIZADA COM NOVOS FILTROS
function criarFiltroCandidatos(candidatoIds, cargoIds, cargoPretendidoIds, mandatos, redutosOrigem, macrorregiaoIds) {
    const filtros = {};
    
    if (candidatoIds && candidatoIds.length > 0) {
        filtros.id = { in: candidatoIds };
    }
    
    if (cargoIds && cargoIds.length > 0) {
        filtros.cargoId = { in: cargoIds };
    }

    if (cargoPretendidoIds && cargoPretendidoIds.length > 0) {
        filtros.cargoPretendidoId = { in: cargoPretendidoIds };
    }

    if (mandatos && mandatos.length > 0) {
        filtros.mandato = { in: mandatos };
    }

    if (redutosOrigem && redutosOrigem.length > 0) {
        filtros.redutoOrigem = { in: redutosOrigem };
    }

    if (macrorregiaoIds && macrorregiaoIds.length > 0) {
        filtros.macrorregiaoId = { in: macrorregiaoIds };
    }
    
    return filtros;
}

export default dashboardController;