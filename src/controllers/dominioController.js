import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

class DominioController {
  // Função utilitária para validar domínio ou URL
  isValidDomainOrUrl = (input) => {
    // Regex para domínio simples (ex: cnnbrasil.com.br)
    const dominioRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    
    // Se for um domínio simples, validar com regex
    if (dominioRegex.test(input)) {
      return true;
    }
    
    // Se não for domínio simples, tentar validar como URL completa
    try {
      const url = new URL(input);
      // Verificar se é HTTP ou HTTPS
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Extrair domínio base de uma URL para comparações
  extractBaseDomain = (input) => {
    try {
      // Se for uma URL completa, extrair o hostname
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const url = new URL(input);
        return url.hostname;
      }
      // Se for apenas um domínio, retornar como está
      return input;
    } catch {
      return input;
    }
  };

  // Listar todos os domínios ativos (para sugestões no frontend)
  listarDominios = async (req, res) => {
    try {
      const { 
        ativo = true, 
        busca,
        limit = 50,
        isRSSapp
      } = req.query;

      const where = {
        ativo: ativo === 'true',
        ...(isRSSapp !== undefined && { isRSSapp: isRSSapp === 'true' }),
        ...(busca && {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { dominio: { contains: busca, mode: 'insensitive' } }
          ]
        })
      };

      const dominios = await prisma.dominioRSS.findMany({
        where,
        orderBy: [
          { ordem: 'asc' },
          { nome: 'asc' }
        ],
        take: parseInt(limit)
      });

      res.json({
        success: true,
        data: dominios,
        total: dominios.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao listar domínios:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Criar novo domínio
  criarDominio = async (req, res) => {
    try {
      const {
        nome,
        dominio,
        ativo = true,
        ordem,
        cor,
        isRSSapp
      } = req.body;

      // Validações básicas
      if (!nome || !dominio) {
        return res.status(400).json({
          success: false,
          error: 'Nome e domínio são obrigatórios'
        });
      }

      // Verificar se domínio já existe
      const dominioExistente = await prisma.dominioRSS.findUnique({
        where: { dominio }
      });

      if (dominioExistente) {
        return res.status(409).json({
          success: false,
          error: 'Domínio já cadastrado'
        });
      }

      // Validar formato do domínio (aceita tanto domínios simples quanto URLs completas)
      if (!this.isValidDomainOrUrl(dominio)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de domínio ou URL inválido. Use um domínio (ex: cnnbrasil.com.br) ou URL completa (ex: https://www.cnnbrasil.com.br/politica/)'
        });
      }

      const novoDominio = await prisma.dominioRSS.create({
        data: {
          nome,
          dominio,
          ativo,
          ordem: ordem ? parseInt(ordem) : null,
          cor,
          isRSSapp
        }
      });

      res.status(201).json({
        success: true,
        data: novoDominio,
        message: 'Domínio criado com sucesso',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao criar domínio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Atualizar domínio
  atualizarDominio = async (req, res) => {
    try {
      const { id } = req.params;
      const {
        nome,
        dominio,
        ativo,
        ordem,
        cor,
        isRSSapp
      } = req.body;

      const dominioExistente = await prisma.dominioRSS.findUnique({
        where: { id }
      });

      if (!dominioExistente) {
        return res.status(404).json({
          success: false,
          error: 'Domínio não encontrado'
        });
      }

      // Se está mudando o domínio, verificar se não existe outro com esse nome
      if (dominio && dominio !== dominioExistente.dominio) {
        const dominioConflito = await prisma.dominioRSS.findUnique({
          where: { dominio }
        });

        if (dominioConflito) {
          return res.status(409).json({
            success: false,
            error: 'Já existe outro domínio com esse endereço'
          });
        }

        // Validar formato do novo domínio (aceita tanto domínios simples quanto URLs completas)
        if (!this.isValidDomainOrUrl(dominio)) {
          return res.status(400).json({
            success: false,
            error: 'Formato de domínio ou URL inválido. Use um domínio (ex: cnnbrasil.com.br) ou URL completa (ex: https://www.cnnbrasil.com.br/politica/)'
          });
        }
      }

      const dominioAtualizado = await prisma.dominioRSS.update({
        where: { id },
        data: {
          ...(nome !== undefined && { nome }),
          ...(dominio !== undefined && { dominio }),
          ...(ativo !== undefined && { ativo }),
          ...(ordem !== undefined && { ordem: ordem ? parseInt(ordem) : null }),
          ...(cor !== undefined && { cor }),
          ...(isRSSapp !== undefined && { isRSSapp })
        }
      });

      res.json({
        success: true,
        data: dominioAtualizado,
        message: 'Domínio atualizado com sucesso',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao atualizar domínio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Deletar domínio
  deletarDominio = async (req, res) => {
    try {
      const { id } = req.params;

      const dominioExistente = await prisma.dominioRSS.findUnique({
        where: { id }
      });

      if (!dominioExistente) {
        return res.status(404).json({
          success: false,
          error: 'Domínio não encontrado'
        });
      }

      await prisma.dominioRSS.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Domínio removido com sucesso',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao deletar domínio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Obter domínio por ID
  obterDominio = async (req, res) => {
    try {
      const { id } = req.params;

      const dominio = await prisma.dominioRSS.findUnique({
        where: { id }
      });

      if (!dominio) {
        return res.status(404).json({
          success: false,
          error: 'Domínio não encontrado'
        });
      }

      res.json({
        success: true,
        data: dominio,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao obter domínio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Importar domínios em lote (para popular a base inicial)
  importarDominios = async (req, res) => {
    try {
      const { dominios } = req.body;

      if (!Array.isArray(dominios) || dominios.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Lista de domínios inválida'
        });
      }

      const resultados = [];
      
      for (const dominioData of dominios) {
        try {
          const { nome, dominio, ativo = true, ordem, cor, isRSSapp } = dominioData;
          
          if (!nome || !dominio) {
            resultados.push({
              dominio: dominio || 'N/A',
              sucesso: false,
              erro: 'Nome e domínio são obrigatórios'
            });
            continue;
          }

          // Verificar se já existe
          const existente = await prisma.dominioRSS.findUnique({
            where: { dominio }
          });

          if (existente) {
            resultados.push({
              dominio,
              sucesso: false,
              erro: 'Domínio já existe'
            });
            continue;
          }

          await prisma.dominioRSS.create({
            data: {
              nome,
              dominio,
              ativo,
              ordem: ordem ? parseInt(ordem) : null,
              cor,
              isRSSapp
            }
          });

          resultados.push({
            dominio,
            sucesso: true
          });

        } catch (error) {
          resultados.push({
            dominio: dominioData.dominio || 'N/A',
            sucesso: false,
            erro: error.message
          });
        }
      }

      const sucessos = resultados.filter(r => r.sucesso).length;
      const falhas = resultados.length - sucessos;

      res.json({
        success: true,
        data: {
          resumo: {
            total: resultados.length,
            sucessos,
            falhas
          },
          resultados
        },
        message: `Importação concluída: ${sucessos} sucessos, ${falhas} falhas`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao importar domínios:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Verificar funcionamento de um domínio
  verificarDominio = async (req, res) => {
    try {
      const { id } = req.params;
      const Parser = require('rss-parser');
      const parser = new Parser();

      const dominio = await prisma.dominioRSS.findUnique({
        where: { id }
      });

      if (!dominio) {
        return res.status(404).json({
          success: false,
          error: 'Domínio não encontrado'
        });
      }

      let verificacaoOk = false;
      let erro = null;

      try {
        // Extrair domínio base para usar na busca do Google News
        const dominioBase = this.extractBaseDomain(dominio.dominio);
        
        // Tentar fazer uma busca via Google News para esse domínio
        const rssUrl = `https://news.google.com/rss/search?q=site:${dominioBase}&hl=pt-BR&gl=BR&ceid=BR:pt-BR`;
        const feed = await parser.parseURL(rssUrl);
        
        verificacaoOk = feed && feed.items && feed.items.length > 0;
        
        if (!verificacaoOk) {
          erro = 'Nenhum artigo encontrado para este domínio';
        }
      } catch (error) {
        erro = `Erro na verificação: ${error.message}`;
      }

      res.json({
        success: true,
        data: {
          dominioId: id,
          dominio: dominio.dominio,
          verificacaoOk,
          erro,
          dataVerificacao: new Date().toISOString()
        },
        message: verificacaoOk ? 'Domínio verificado com sucesso' : 'Falha na verificação do domínio',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao verificar domínio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };

  // Obter prévia de como o domínio será processado
  previewDominio = async (req, res) => {
    try {
      const { dominio } = req.body;

      if (!dominio) {
        return res.status(400).json({
          success: false,
          error: 'Domínio é obrigatório'
        });
      }

      const isValid = this.isValidDomainOrUrl(dominio);
      const dominioBase = this.extractBaseDomain(dominio);
      const isUrl = dominio.startsWith('http://') || dominio.startsWith('https://');

      res.json({
        success: true,
        data: {
          dominioOriginal: dominio,
          dominioBase: dominioBase,
          isValid: isValid,
          isUrl: isUrl,
          tipo: isUrl ? 'URL Completa' : 'Domínio Simples',
          googleNewsUrl: `https://news.google.com/rss/search?q=site:${dominioBase}&hl=pt-BR&gl=BR&ceid=BR:pt-BR`,
          exemplos: {
            dominioSimples: 'cnnbrasil.com.br',
            urlCompleta: 'https://www.cnnbrasil.com.br/politica/ultimas-noticias/'
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Erro ao gerar prévia do domínio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  };
}

export default new DominioController();