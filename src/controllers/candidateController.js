import prisma from '../config/database.js';

// GET /api/candidates - Listar candidatos (apenas ativos por padrão)
const index = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 1000, 
      search, 
      cargo, 
      viabilidade, 
      orderBy = 'criadoEm', 
      order = 'desc',
      includeInactive = false
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Filtros
    const where = {};
    
    // Por padrão, só mostra candidatos ativos
    if (includeInactive !== 'true') {
      where.ativo = true;
    }
    
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { redutoOrigem: { contains: search, mode: 'insensitive' } },
        // Buscar por cargo atual
        {
          cargo: {
            nome: { contains: search, mode: 'insensitive' }
          }
        },
        // Buscar por cargo pretendido
        {
          cargoPretendido: {
            nome: { contains: search, mode: 'insensitive' }
          }
        }
      ];
    }

    if (cargo) {
      where.OR = [
        // Filtrar por cargo atual
        {
          cargo: {
            nome: { contains: cargo, mode: 'insensitive' }
          }
        },
        // Filtrar por cargo pretendido
        {
          cargoPretendido: {
            nome: { contains: cargo, mode: 'insensitive' }
          }
        }
      ];
    }

    if (viabilidade) {
      const ranges = {
        'ALTA': { gte: 7 },
        'MEDIA': { gte: 4, lt: 7 },
        'BAIXA': { lt: 4 }
      };
      
      if (ranges[viabilidade]) {
        where.pontuacaoViabilidade = ranges[viabilidade];
      }
    }

    const validOrderBy = ['nome', 'criadoEm', 'pontuacaoViabilidade', 'votosUltimaEleicao'];
    const validOrder = ['asc', 'desc'];
    
    const finalOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'criadoEm';
    const finalOrder = validOrder.includes(order) ? order : 'desc';

    const [candidates, total] = await Promise.all([
      prisma.candidato.findMany({
        where,
        skip,
        take,
        include: {
          criador: {
            select: { nome: true, email: true }
          },
          cargo: {
            select: { id: true, nome: true, nivel: true }
          },
          cargoPretendido: {
            select: { id: true, nome: true, nivel: true }
          },
          macrorregiao: {
            select: { id: true, nome: true }
          },
          _count: {
            select: { insights: true }
          }
        },
        orderBy: { [finalOrderBy]: finalOrder }
      }),
      prisma.candidato.count({ where })
    ]);

    // Mapear os dados para incluir campos "virtuais" para compatibilidade
    const candidatesWithCompatibility = candidates.map(candidate => ({
      ...candidate,
      cargoAtual: candidate.cargo?.nome || null,
      cargoPretendido: candidate.cargoPretendido?.nome || null
    }));

    res.json({
      success: true,
      data: candidatesWithCompatibility,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/candidates/:id - Buscar candidato específico
const show = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { includeInactive = false } = req.query;

    const where = { id };
    
    // Por padrão, só mostra se estiver ativo
    if (includeInactive !== 'true') {
      where.ativo = true;
    }

    const candidate = await prisma.candidato.findUnique({
      where,
      include: {
        criador: {
          select: { nome: true, email: true }
        },
        cargo: {
          select: { id: true, nome: true, nivel: true }
        },
        cargoPretendido: { // ✅ NOVO
          select: { id: true, nome: true, nivel: true }
        },
        macrorregiao: {
          select: { id: true, nome: true }
        },
        insights: {
          include: {
            criador: {
              select: { nome: true }
            }
          },
          orderBy: { criadoEm: 'desc' }
        }
      }
    });

    if (!candidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado ou inativo' 
      });
    }

    res.json({
      success: true,
      data: candidate
    });

  } catch (error) {
    next(error);
  } 
};

// POST /api/candidates - Criar candidato
const store = async (req, res, next) => {
  try {
    const {
      nome,
      foto,
      cargoId,
      macrorregiaoId,
      redutoOrigem,
      votosUltimaEleicao,
      populacaoCidade,
      votosValidos,
      cargoPretendidoId,
      instagramHandle,
      observacoes,
      urlRss,
      urlDrive
    } = req.body;

    if (!nome?.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Nome é obrigatório' 
      });
    }

    // Verificar se já existe candidato ATIVO com mesmo nome
    const existingCandidate = await prisma.candidato.findFirst({
      where: {
        nome: {
          equals: nome.trim(),
          mode: 'insensitive'
        },
        ativo: true
      }
    });

    if (existingCandidate) {
      return res.status(400).json({
        success: false,
        error: 'Já existe um candidato ativo com este nome'
      });
    }

    const candidate = await prisma.candidato.create({
      data: {
        nome: nome.trim(),
        foto: foto?.trim() || null,
        cargoId: cargoId || null,
        macrorregiaoId: macrorregiaoId || null,
        redutoOrigem: redutoOrigem?.trim() || null,
        votosUltimaEleicao: votosUltimaEleicao ? parseInt(votosUltimaEleicao) : null,
        populacaoCidade: populacaoCidade ? parseInt(populacaoCidade) : null,
        votosValidos: votosValidos ? parseInt(votosValidos) : null,
        cargoPretendidoId: cargoPretendidoId || null, // ✅ MUDANÇA
        instagramHandle: instagramHandle?.trim() || null,
        observacoes: observacoes?.trim() || null,
        urlRss: urlRss?.trim() || null, // ✅ NOVO
        urlDrive: urlDrive?.trim() || null, // ✅ NOVO
        ativo: true,
        criadoPor: req.user.id
      },
      include: {
        criador: {
          select: { nome: true, email: true }
        },
        cargo: {
          select: { id: true, nome: true, nivel: true }
        },
        cargoPretendido: { // ✅ NOVO
          select: { id: true, nome: true, nivel: true }
        },
        macrorregiao: {
          select: { id: true, nome: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Candidato criado com sucesso',
      data: candidate
    });

  } catch (error) {
    next(error);
  }
};

// PUT /api/candidates/:id - Atualizar candidato
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nome,
      foto,
      cargoId,
      macrorregiaoId,
      redutoOrigem,
      votosUltimaEleicao,
      populacaoCidade,
      votosValidos,
      cargoPretendidoId, // ✅ MUDANÇA
      instagramHandle,
      observacoes,
      urlRss,
      urlDrive
    } = req.body;
    // Verificar se candidato existe e está ativo
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    if (!existingCandidate.ativo) {
      return res.status(400).json({ 
        success: false,
        error: 'Não é possível editar um candidato inativo' 
      });
    }

    // Validar nome se foi alterado
    if (nome && nome.trim() !== existingCandidate.nome) {
      const duplicateCandidate = await prisma.candidato.findFirst({
        where: {
          nome: {
            equals: nome.trim(),
            mode: 'insensitive'
          },
          id: {
            not: id
          },
          ativo: true // Só verificar entre os ativos
        }
      });

      if (duplicateCandidate) {
        return res.status(400).json({
          success: false,
          error: 'Já existe um candidato ativo com este nome'
        });
      }
    }

    const candidate = await prisma.candidato.update({
      where: { id },
      data: {
        ...(nome && { nome: nome.trim() }),
        ...(foto !== undefined && { foto: foto?.trim() || null }),
        ...(cargoId !== undefined && { cargoId: cargoId || null }),
        ...(macrorregiaoId !== undefined && { macrorregiaoId: macrorregiaoId || null }),
        ...(redutoOrigem !== undefined && { redutoOrigem: redutoOrigem?.trim() || null }),
        ...(votosUltimaEleicao !== undefined && { 
          votosUltimaEleicao: votosUltimaEleicao ? parseInt(votosUltimaEleicao) : null 
        }),
        ...(populacaoCidade !== undefined && { 
          populacaoCidade: populacaoCidade ? parseInt(populacaoCidade) : null 
        }),
        ...(votosValidos !== undefined && { 
          votosValidos: votosValidos ? parseInt(votosValidos) : null 
        }),
        ...(cargoPretendidoId !== undefined && { cargoPretendidoId: cargoPretendidoId || null }), // ✅ MUDANÇA
        ...(instagramHandle !== undefined && { instagramHandle: instagramHandle?.trim() || null }),
        ...(observacoes !== undefined && { observacoes: observacoes?.trim() || null }),
        ...(urlRss !== undefined && { urlRss: urlRss?.trim() || null }),
        ...(urlDrive !== undefined && { urlDrive: urlDrive?.trim() || null })
      },
      include: {
        criador: {
          select: { nome: true, email: true }
        },
        cargo: {
          select: { id: true, nome: true, nivel: true }
        },
        cargoPretendido: { // ✅ NOVO
          select: { id: true, nome: true, nivel: true }
        },
        macrorregiao: {
          select: { id: true, nome: true }
        }
      }
    });

    res.json({
      success: true,
      message: 'Candidato atualizado com sucesso',
      data: candidate
    });

  } catch (error) {
    next(error);
  }
};

// DELETE /api/candidates/:id - Inativar candidato (soft delete)
const destroy = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verificar se candidato existe
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    if (!existingCandidate.ativo) {
      return res.status(400).json({ 
        success: false,
        error: 'Candidato já está inativo' 
      });
    }

    // Inativar candidato (soft delete)
    await prisma.candidato.update({
      where: { id },
      data: { 
        ativo: false 
      }
    });

    res.json({ 
      success: true,
      message: 'Candidato inativado com sucesso' 
    });

  } catch (error) {
    next(error);
  }
};

// PUT /api/candidates/:id/reactivate - Reativar candidato
const reactivate = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verificar se candidato existe
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    if (existingCandidate.ativo) {
      return res.status(400).json({ 
        success: false,
        error: 'Candidato já está ativo' 
      });
    }

    // Verificar se não há conflito de nome com candidatos ativos
    const duplicateCandidate = await prisma.candidato.findFirst({
      where: {
        nome: {
          equals: existingCandidate.nome,
          mode: 'insensitive'
        },
        id: {
          not: id
        },
        ativo: true
      }
    });

    if (duplicateCandidate) {
      return res.status(400).json({
        success: false,
        error: 'Já existe um candidato ativo com este nome. Não é possível reativar.'
      });
    }

    // Reativar candidato
    const candidate = await prisma.candidato.update({
      where: { id },
      data: { 
        ativo: true 
      },
      include: {
        criador: {
          select: { nome: true, email: true }
        }
      }
    });

    res.json({ 
      success: true,
      message: 'Candidato reativado com sucesso',
      data: candidate
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/candidates/stats - Estatísticas dos candidatos (apenas ativos)
const stats = async (req, res, next) => {
  try {
    const [
      total,
      totalInativo,
      comViabilidade,
      porCargo,
      comInstagram,
      criadosUltimos30Dias
    ] = await Promise.all([
      // Total de candidatos ativos
      prisma.candidato.count({
        where: { ativo: true }
      }),
      
      // Total de candidatos inativos
      prisma.candidato.count({
        where: { ativo: false }
      }),
      
      // Candidatos ativos com pontuação de viabilidade
      prisma.candidato.count({
        where: {
          ativo: true,
          pontuacaoViabilidade: {
            not: null
          }
        }
      }),
      
      // Candidatos ativos por cargo pretendido - CORRIGIDO
      prisma.candidato.groupBy({
        by: ['cargoPretendidoId'],
        _count: true,
        where: {
          ativo: true,
          cargoPretendidoId: {
            not: null
          }
        },
        orderBy: {
          _count: {
            cargoPretendidoId: 'desc'
          }
        }
      }),
      
      // Candidatos ativos com Instagram
      prisma.candidato.count({
        where: {
          ativo: true,
          instagramHandle: {
            not: null
          }
        }
      }),
      
      // Candidatos ativos criados nos últimos 30 dias
      prisma.candidato.count({
        where: {
          ativo: true,
          criadoEm: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    // Calcular média de viabilidade apenas dos ativos
    const viabilidadeMedia = await prisma.candidato.aggregate({
      _avg: {
        pontuacaoViabilidade: true
      },
      where: {
        ativo: true,
        pontuacaoViabilidade: {
          not: null
        }
      }
    });

    // Buscar nomes dos cargos para as estatísticas
    const cargosComNomes = await Promise.all(
      porCargo.map(async (item) => {
        if (!item.cargoPretendidoId) return { cargo: 'Sem cargo', quantidade: item._count };
        
        const cargo = await prisma.cargo.findUnique({
          where: { id: item.cargoPretendidoId },
          select: { nome: true }
        });
        
        return {
          cargo: cargo?.nome || 'Cargo não encontrado',
          quantidade: item._count
        };
      })
    );

    res.json({
      success: true,
      data: {
        total,
        totalInativo,
        comViabilidade,
        comInstagram,
        criadosUltimos30Dias,
        viabilidadeMedia: viabilidadeMedia._avg.pontuacaoViabilidade || 0,
        porCargo: cargosComNomes
      }
    });

  } catch (error) {
    next(error);
  }
};

// POST /api/candidates/:id/insights - Criar insight estratégico para candidato
const createInsight = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { titulo, conteudo } = req.body;

    // Validações
    if (!titulo?.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Título é obrigatório' 
      });
    }

    if (!conteudo?.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Conteúdo é obrigatório' 
      });
    }

    // Verificar se candidato existe e está ativo
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id },
      select: { id: true, nome: true, ativo: true }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    if (!existingCandidate.ativo) {
      return res.status(400).json({ 
        success: false,
        error: 'Não é possível adicionar insights a candidatos inativos' 
      });
    }

    // Criar insight estratégico
    const insight = await prisma.insightEstrategico.create({
      data: {
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        candidatoId: id,
        criadoPor: req.user.id
      },
      include: {
        criador: {
          select: { nome: true, email: true }
        },
        candidato: {
          select: { id: true, nome: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Insight estratégico criado com sucesso',
      data: insight
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/candidates/:id/publicacoes - Buscar publicações do candidato
const getPublicacoes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 10, orderBy = 'timestamp', order = 'desc' } = req.query;
    
    // Verificar se candidato existe
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id },
      select: { id: true, nome: true, ativo: true }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    const validOrderBy = ['timestamp', 'likesCount', 'commentsCount', 'criadoEm'];
    const validOrder = ['asc', 'desc'];
    
    const finalOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'timestamp';
    const finalOrder = validOrder.includes(order) ? order : 'desc';

    const publicacoes = await prisma.publicacoes.findMany({
      where: { 
        candidatoId: id,
        timestamp: { not: null } // Apenas posts com data
      },
      take: parseInt(limit),
      select: {
        id: true,
        instagramPostId: true,
        type: true,
        shortCode: true,
        caption: true,
        hashtags: true,
        mentions: true,
        url: true,
        commentsCount: true,
        displayUrl: true,
        likesCount: true,
        timestamp: true,
        locationName: true,
        dimensionsHeight: true,
        dimensionsWidth: true,
        isCommentsDisabled: true,
        ownerUsername: true
      },
      orderBy: { [finalOrderBy]: finalOrder }
    });

    res.json({
      success: true,
      data: publicacoes,
      candidato: {
        id: existingCandidate.id,
        nome: existingCandidate.nome
      }
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/candidates/:id/insights - Listar insights estratégicos do candidato
const getInsights = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, orderBy = 'criadoEm', order = 'desc' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Verificar se candidato existe
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id },
      select: { id: true, nome: true, ativo: true }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    const validOrderBy = ['titulo', 'criadoEm', 'atualizadoEm'];
    const validOrder = ['asc', 'desc'];
    
    const finalOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'criadoEm';
    const finalOrder = validOrder.includes(order) ? order : 'desc';

    const [insights, total] = await Promise.all([
      prisma.insightEstrategico.findMany({
        where: { candidatoId: id },
        skip,
        take,
        include: {
          criador: {
            select: { nome: true, email: true }
          }
        },
        orderBy: { [finalOrderBy]: finalOrder }
      }),
      prisma.insightEstrategico.count({ 
        where: { candidatoId: id } 
      })
    ]);

    res.json({
      success: true,
      data: {
        candidato: {
          id: existingCandidate.id,
          nome: existingCandidate.nome,
          ativo: existingCandidate.ativo
        },
        insights
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    next(error);
  }
};

// PUT /api/candidates/:candidateId/insights/:insightId - Atualizar insight estratégico
const updateInsight = async (req, res, next) => {
  try {
    const { candidateId, insightId } = req.params;
    const { titulo, conteudo } = req.body;

    // Verificar se insight existe e pertence ao candidato
    const existingInsight = await prisma.insightEstrategico.findFirst({
      where: {
        id: insightId,
        candidatoId: candidateId
      },
      include: {
        candidato: {
          select: { id: true, nome: true, ativo: true }
        }
      }
    });

    if (!existingInsight) {
      return res.status(404).json({ 
        success: false,
        error: 'Insight não encontrado ou não pertence a este candidato' 
      });
    }

    // Verificar se candidato está ativo
    if (!existingInsight.candidato.ativo) {
      return res.status(400).json({ 
        success: false,
        error: 'Não é possível editar insights de candidatos inativos' 
      });
    }

    // Validações (apenas se os campos foram enviados)
    if (titulo !== undefined && !titulo?.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Título não pode estar vazio' 
      });
    }

    if (conteudo !== undefined && !conteudo?.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Conteúdo não pode estar vazio' 
      });
    }

    // Atualizar insight
    const updatedInsight = await prisma.insightEstrategico.update({
      where: { id: insightId },
      data: {
        ...(titulo !== undefined && { titulo: titulo.trim() }),
        ...(conteudo !== undefined && { conteudo: conteudo.trim() })
      },
      include: {
        criador: {
          select: { nome: true, email: true }
        },
        candidato: {
          select: { id: true, nome: true }
        }
      }
    });

    res.json({
      success: true,
      message: 'Insight estratégico atualizado com sucesso',
      data: updatedInsight
    });

  } catch (error) {
    next(error);
  }
};

// DELETE /api/candidates/:candidateId/insights/:insightId - Deletar insight estratégico
const deleteInsight = async (req, res, next) => {
  try {
    const { candidateId, insightId } = req.params;

    // Verificar se insight existe e pertence ao candidato
    const existingInsight = await prisma.insightEstrategico.findFirst({
      where: {
        id: insightId,
        candidatoId: candidateId
      },
      include: {
        candidato: {
          select: { ativo: true }
        }
      }
    });

    if (!existingInsight) {
      return res.status(404).json({ 
        success: false,
        error: 'Insight não encontrado ou não pertence a este candidato' 
      });
    }

    // Verificar se candidato está ativo
    if (!existingInsight.candidato.ativo) {
      return res.status(400).json({ 
        success: false,
        error: 'Não é possível deletar insights de candidatos inativos' 
      });
    }

    // Deletar insight
    await prisma.insightEstrategico.delete({
      where: { id: insightId }
    });

    res.json({
      success: true,
      message: 'Insight estratégico deletado com sucesso'
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/candidates/:id/sentimentos - Buscar análises de sentimento do candidato
const getSentimentos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    // Verificar se candidato existe
    const existingCandidate = await prisma.candidato.findUnique({
      where: { id },
      select: { id: true, nome: true, ativo: true }
    });

    if (!existingCandidate) {
      return res.status(404).json({ 
        success: false,
        error: 'Candidato não encontrado' 
      });
    }

    // Buscar análises de sentimento do candidato
    const analises = await prisma.analisesSentimento.findMany({
      where: { candidatoId: id },
      take: parseInt(limit),
      include: {
        publicacao: {
          select: {
            shortCode: true,
            caption: true,
            timestamp: true,
            type: true
          }
        }
      },
      orderBy: { processadoEm: 'desc' }
    });

    // Calcular estatísticas
    const totalAnalises = analises.length;
    
    if (totalAnalises === 0) {
      return res.json({
        success: true,
        data: {
          ultimaAnalise: null,
          estatisticas: {
            total: 0,
            distribuicao: { positivo: 0, negativo: 0, neutro: 0 },
            scoreMedio: 0,
            confiancaMedia: 0
          },
          analises: []
        }
      });
    }

    const distribuicao = {
      positivo: analises.filter(a => a.sentimentoLabel === 'POSITIVO').length,
      negativo: analises.filter(a => a.sentimentoLabel === 'NEGATIVO').length,
      neutro: analises.filter(a => a.sentimentoLabel === 'NEUTRO').length
    };

    const scoreMedio = analises.reduce((acc, a) => acc + a.sentimentoScore, 0) / totalAnalises;
    const confiancaMedia = analises.reduce((acc, a) => acc + a.confianca, 0) / totalAnalises;

    // Coletar palavras-chave de todas as análises
    const todasPalavras = [];
    analises.forEach(analise => {
      if (analise.resumoInsights && Array.isArray(analise.resumoInsights.palavrasChave)) {
        todasPalavras.push(...analise.resumoInsights.palavrasChave);
      }
    });

    // Contar frequência das palavras
    const frequenciaPalavras = {};
    todasPalavras.forEach(palavra => {
      frequenciaPalavras[palavra] = (frequenciaPalavras[palavra] || 0) + 1;
    });

    // Ordenar por frequência e pegar as top 10
    const palavrasChave = Object.entries(frequenciaPalavras)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([palavra]) => palavra);

    res.json({
      success: true,
      data: {
        ultimaAnalise: analises[0],
        estatisticas: {
          total: totalAnalises,
          distribuicao,
          scoreMedio: parseFloat(scoreMedio.toFixed(3)),
          confiancaMedia: parseFloat(confiancaMedia.toFixed(3)),
          palavrasChave
        },
        analises: analises.slice(0, 5) // Últimas 5 para histórico
      }
    });

  } catch (error) {
    next(error);
  }
};

export default {
  index,
  show,
  store,
  update,
  destroy,
  reactivate,
  stats,
  createInsight,
  getInsights,
  updateInsight,
  deleteInsight,
  getPublicacoes,
  getSentimentos,
};