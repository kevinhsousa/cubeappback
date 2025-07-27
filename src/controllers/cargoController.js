import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Listar todos os cargos
const listarCargos = async (req, res) => {
  try {
    const { search } = req.query;
    
    const where = { ativo: true }; // ✅ ADICIONAR filtro de ativo
    
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
      ];
    }

    const cargos = await prisma.cargo.findMany({
      where,
      orderBy: [
        { nivel: 'asc' },
        { nome: 'asc' }
      ]
    });

    // ✅ FORMATO PADRÃO da API
    res.json({
      success: true,
      data: cargos
    });
  } catch (error) {
    console.error('Erro ao buscar cargos:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

// Buscar cargo por ID
const buscarCargoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    
    const cargo = await prisma.cargo.findUnique({
      where: { id } // ✅ Não usar parseInt
    });

    if (!cargo) {
      return res.status(404).json({ 
        success: false,
        error: 'Cargo não encontrado' 
      });
    }

    res.json({
      success: true,
      data: cargo
    });
  } catch (error) {
    console.error('Erro ao buscar cargo:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

// Criar novo cargo
const criarCargo = async (req, res) => {
  try {
    const { nome, descricao, nivel } = req.body;

    // Validações
    if (!nome || !nivel) {
      return res.status(400).json({ 
        success: false,
        error: 'Nome e nível são obrigatórios' 
      });
    }

    if (!['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'DISTRITAL'].includes(nivel)) {
      return res.status(400).json({ 
        success: false,
        error: 'Nível deve ser FEDERAL, ESTADUAL, MUNICIPAL ou DISTRITAL' 
      });
    }

    // Verificar se já existe cargo com mesmo nome
    const cargoExistente = await prisma.cargo.findFirst({
      where: { 
        nome: { equals: nome, mode: 'insensitive' },
        ativo: true
      }
    });

    if (cargoExistente) {
      return res.status(409).json({ 
        success: false,
        error: 'Já existe um cargo com este nome' 
      });
    }

    const novoCargo = await prisma.cargo.create({
      data: {
        nome,
        descricao,
        nivel,
        ativo: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Cargo criado com sucesso',
      data: novoCargo
    });
  } catch (error) {
    console.error('Erro ao criar cargo:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

// Atualizar cargo
const atualizarCargo = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, nivel } = req.body;

    // Verificar se cargo existe
    const cargoExistente = await prisma.cargo.findUnique({
      where: { id } // ✅ ID é string (cuid), não parseInt
    });

    if (!cargoExistente) {
      return res.status(404).json({ error: 'Cargo não encontrado' });
    }

    // Validações
    if (nivel && !['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'DISTRITAL'].includes(nivel)) {
      return res.status(400).json({ 
        success: false,
        error: 'Nível deve ser FEDERAL, ESTADUAL, MUNICIPAL ou DISTRITAL' 
      });
    }

    // Verificar se já existe outro cargo com mesmo nome
    if (nome) {
      const outroCargoMesmoNome = await prisma.cargo.findFirst({
        where: { 
          AND: [
            { nome: { equals: nome, mode: 'insensitive' } },
            { id: { not: id } }
          ]
        }
      });

      if (outroCargoMesmoNome) {
        return res.status(409).json({ 
          success: false,
          error: 'Já existe outro cargo com este nome' 
        });
      }
    }

    const cargoAtualizado = await prisma.cargo.update({
      where: { id },
      data: {
        ...(nome && { nome }),
        ...(descricao !== undefined && { descricao }),
        ...(nivel && { nivel })
      }
    });

    res.json({
      success: true,
      message: 'Cargo atualizado com sucesso',
      data: cargoAtualizado
    });
  } catch (error) {
    console.error('Erro ao atualizar cargo:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

// Deletar cargo
const deletarCargo = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se cargo existe
    const cargoExistente = await prisma.cargo.findUnique({
      where: { id }  // ✅ ID é string (cuid), não parseInt
    });

    if (!cargoExistente) {
      return res.status(404).json({ error: 'Cargo não encontrado' });
    }

    // ✅ CORRIGIDO - verificar candidatos usando cargoId
    const candidatosComCargo = await prisma.candidato.count({
      where: {
        cargoId: id  // ✅ Usar cargoId em vez de cargoAtual/cargoPretendido
      }
    });

    if (candidatosComCargo > 0) {
      return res.status(409).json({ 
        error: 'Não é possível deletar um cargo que está sendo usado por candidatos' 
      });
    }

    await prisma.cargo.delete({
      where: { id }
    });

    res.json({ 
      success: true,
      message: 'Cargo deletado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao deletar cargo:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

// Buscar cargos por nível
const buscarCargosPorNivel = async (req, res) => {
  try {
    const { nivel } = req.params;

    if (!['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'DISTRITAL'].includes(nivel)) {
      return res.status(400).json({ 
        error: 'Nível deve ser FEDERAL, ESTADUAL, MUNICIPAL ou DISTRITAL' 
      });
    }

    const cargos = await prisma.cargo.findMany({
      where: { nivel },
      orderBy: { nome: 'asc' }
    });

    res.json(cargos);
  } catch (error) {
    console.error('Erro ao buscar cargos por nível:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

// Buscar nomes únicos dos cargos em uso
const getUniqueCargoNames = async (req, res) => {
  try {
    // Buscar todos os cargos que estão sendo usados por candidatos ativos
    const cargosUsados = await prisma.candidato.findMany({
      where: { 
        ativo: true,
        OR: [
          { cargoId: { not: null } },
          { cargoPretendidoId: { not: null } }
        ]
      },
      include: {
        cargo: {
          select: { nome: true }
        },
        cargoPretendido: {
          select: { nome: true }
        }
      }
    });

    // Extrair nomes únicos
    const nomesUnicos = new Set();
    
    cargosUsados.forEach(candidato => {
      if (candidato.cargo?.nome) {
        nomesUnicos.add(candidato.cargo.nome);
      }
      if (candidato.cargoPretendido?.nome) {
        nomesUnicos.add(candidato.cargoPretendido.nome);
      }
    });

    const nomesArray = Array.from(nomesUnicos).sort();

    res.json({
      success: true,
      data: nomesArray
    });
  } catch (error) {
    console.error('Erro ao buscar cargos únicos:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
};

export default {
  listarCargos,
  buscarCargoPorId,
  criarCargo,
  atualizarCargo,
  deletarCargo,
  buscarCargosPorNivel,
  getUniqueCargoNames,
  index: listarCargos
};
