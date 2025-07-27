import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const userController = {
  // GET /api/users - Listar todos os usuários
  index: async (req, res) => {
    try {
      const { page = 1, limit = 10, search, tipo, ativo } = req.query;
      
      // Construir filtros
      const where = {};
      
      if (search) {
        where.OR = [
          { nome: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      if (tipo) {
        where.tipo = tipo;
      }
      
      if (ativo !== undefined) {
        where.ativo = ativo === 'true';
      }

      // Calcular paginação
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      // Buscar usuários
      const [usuarios, total] = await Promise.all([
        prisma.usuario.findMany({
          where,
          skip,
          take,
          select: {
            id: true,
            email: true,
            nome: true,
            tipo: true,
            ativo: true,
            criadoEm: true,
            atualizadoEm: true
            // Não retornar senha
          },
          orderBy: { criadoEm: 'desc' }
        }),
        prisma.usuario.count({ where })
      ]);

      res.json({
        usuarios,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao listar usuários:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  },

  // GET /api/users/:id - Buscar usuário por ID
  show: async (req, res) => {
    try {
      const { id } = req.params;

      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          nome: true,
          tipo: true,
          ativo: true,
          criadoEm: true,
          atualizadoEm: true
          // Não retornar senha
        }
      });

      if (!usuario) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      res.json(usuario);
      
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  },

  // POST /api/users - Criar novo usuário
  store: async (req, res) => {
    try {
      const { email, senha, nome, tipo = 'ADMIN', ativo = true } = req.body;

      // Validações básicas
      if (!email || !senha || !nome) {
        return res.status(400).json({
          error: 'Dados obrigatórios não fornecidos',
          required: ['email', 'senha', 'nome']
        });
      }

      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: 'Formato de email inválido'
        });
      }

      // Validar tamanho da senha
      if (senha.length < 6) {
        return res.status(400).json({
          error: 'Senha deve ter pelo menos 6 caracteres'
        });
      }

      // Validar tipo de usuário
      const tiposValidos = ['ADMIN', 'USUARIO'];
      if (!tiposValidos.includes(tipo)) {
        return res.status(400).json({
          error: 'Tipo de usuário inválido',
          valid_types: tiposValidos
        });
      }

      // Verificar se email já existe
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { email }
      });

      if (usuarioExistente) {
        return res.status(409).json({
          error: 'Email já está em uso'
        });
      }

      // Criptografar senha
      const saltRounds = 12;
      const senhaHash = await bcrypt.hash(senha, saltRounds);

      // Criar usuário
      const novoUsuario = await prisma.usuario.create({
        data: {
          email,
          senha: senhaHash,
          nome,
          tipo,
          ativo
        },
        select: {
          id: true,
          email: true,
          nome: true,
          tipo: true,
          ativo: true,
          criadoEm: true,
          atualizadoEm: true
          // Não retornar senha
        }
      });

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        usuario: novoUsuario
      });
      
    } catch (error) {
      console.error('❌ Erro ao criar usuário:', error);
      
      // Tratar erro de constraint unique do Prisma
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'Email já está em uso'
        });
      }
      
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  },

  // PUT /api/users/:id - Atualizar usuário (SEM senha)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { email, nome, tipo, ativo } = req.body;

      // Verificar se usuário existe
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { id }
      });

      if (!usuarioExistente) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      // Verificar se o usuário só pode editar seu próprio perfil (exceto admins)
      if (req.user.tipo !== 'ADMIN' && req.user.id !== id) {
        return res.status(403).json({
          error: 'Você só pode editar seu próprio perfil'
        });
      }

      // Preparar dados para atualização
      const dadosAtualizacao = {};

      if (email) {
        // Validar formato do email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            error: 'Formato de email inválido'
          });
        }

        // Verificar se email já está em uso por outro usuário
        const emailEmUso = await prisma.usuario.findFirst({
          where: {
            email,
            id: { not: id }
          }
        });

        if (emailEmUso) {
          return res.status(409).json({
            error: 'Email já está em uso por outro usuário'
          });
        }

        dadosAtualizacao.email = email;
      }

      if (nome !== undefined) {
        if (!nome.trim()) {
          return res.status(400).json({
            error: 'Nome não pode estar vazio'
          });
        }
        dadosAtualizacao.nome = nome.trim();
      }

      // Apenas admins podem alterar tipo e status de outros usuários
      if (req.user.tipo === 'ADMIN') {
        if (tipo) {
          // Validar tipo de usuário
          const tiposValidos = ['ADMIN', 'USUARIO'];
          if (!tiposValidos.includes(tipo)) {
            return res.status(400).json({
              error: 'Tipo de usuário inválido',
              valid_types: tiposValidos
            });
          }
          dadosAtualizacao.tipo = tipo;
        }

        if (ativo !== undefined) {
          dadosAtualizacao.ativo = Boolean(ativo);
        }
      }

      // Se não há dados para atualizar
      if (Object.keys(dadosAtualizacao).length === 0) {
        return res.status(400).json({
          error: 'Nenhum dado válido fornecido para atualização'
        });
      }

      // Atualizar usuário
      const usuarioAtualizado = await prisma.usuario.update({
        where: { id },
        data: dadosAtualizacao,
        select: {
          id: true,
          email: true,
          nome: true,
          tipo: true,
          ativo: true,
          criadoEm: true,
          atualizadoEm: true
          // Não retornar senha
        }
      });

      res.json({
        message: 'Usuário atualizado com sucesso',
        usuario: usuarioAtualizado
      });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar usuário:', error);
      
      // Tratar erro de constraint unique do Prisma
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'Email já está em uso'
        });
      }
      
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  },

  // PUT /api/users/:id/password - Alterar senha específica
  changePassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { senhaAtual, novaSenha } = req.body;

      // Verificar se é o próprio usuário tentando alterar a senha
      if (req.user.id !== id) {
        return res.status(403).json({
          error: 'Você só pode alterar sua própria senha'
        });
      }

      // Validações básicas
      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({
          error: 'Senha atual e nova senha são obrigatórias',
          required: ['senhaAtual', 'novaSenha']
        });
      }

      // Validar tamanho da nova senha
      if (novaSenha.length < 6) {
        return res.status(400).json({
          error: 'Nova senha deve ter pelo menos 6 caracteres'
        });
      }

      // Buscar usuário com senha para verificação
      const usuario = await prisma.usuario.findUnique({
        where: { id }
      });

      if (!usuario) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      // Verificar senha atual
      const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
      if (!senhaValida) {
        return res.status(400).json({
          error: 'Senha atual incorreta'
        });
      }

      // Verificar se a nova senha é diferente da atual
      const novaSenhaIgualAtual = await bcrypt.compare(novaSenha, usuario.senha);
      if (novaSenhaIgualAtual) {
        return res.status(400).json({
          error: 'A nova senha deve ser diferente da senha atual'
        });
      }

      // Criptografar nova senha
      const saltRounds = 12;
      const novaSenhaHash = await bcrypt.hash(novaSenha, saltRounds);

      // Atualizar senha
      await prisma.usuario.update({
        where: { id },
        data: { senha: novaSenhaHash }
      });

      

      res.json({
        message: 'Senha alterada com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao alterar senha:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  },

  // DELETE /api/users/:id - Deletar usuário
  destroy: async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se usuário existe
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { id }
      });

      if (!usuarioExistente) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      // Verificar se não é o próprio usuário tentando se deletar
      if (req.user.id === id) {
        return res.status(400).json({
          error: 'Você não pode deletar sua própria conta'
        });
      }

      // Verificar se há pelo menos um admin ativo restante
      if (usuarioExistente.tipo === 'ADMIN' && usuarioExistente.ativo) {
        const adminsAtivos = await prisma.usuario.count({
          where: {
            tipo: 'ADMIN',
            ativo: true,
            id: { not: id }
          }
        });

        if (adminsAtivos === 0) {
          return res.status(400).json({
            error: 'Não é possível deletar o último administrador ativo do sistema'
          });
        }
      }

      // Deletar usuário
      await prisma.usuario.delete({
        where: { id }
      });

      res.json({
        message: 'Usuário deletado com sucesso'
      });
      
    } catch (error) {
      console.error('❌ Erro ao deletar usuário:', error);
      
      // Tratar erro de registro não encontrado do Prisma
      if (error.code === 'P2025') {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }
      
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  },

  // POST /api/users/first-user - Criar o primeiro usuário ADMIN
  firstUser: async (req, res) => {
    try {
      // Verificar se já existe algum usuário no sistema
      const totalUsuarios = await prisma.usuario.count();
      
      if (totalUsuarios > 0) {
        return res.status(403).json({
          error: 'Sistema já possui usuários cadastrados. Use as rotas normais.'
        });
      }

      const { email, senha, nome } = req.body;

      // Validações básicas
      if (!email || !senha || !nome) {
        return res.status(400).json({
          error: 'Dados obrigatórios não fornecidos',
          required: ['email', 'senha', 'nome']
        });
      }

      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: 'Formato de email inválido'
        });
      }

      // Validar tamanho da senha
      if (senha.length < 6) {
        return res.status(400).json({
          error: 'Senha deve ter pelo menos 6 caracteres'
        });
      }

      // Criptografar senha
      const saltRounds = 12;
      const senhaHash = await bcrypt.hash(senha, saltRounds);

      // Criar primeiro usuário como ADMIN
      const primeiroUsuario = await prisma.usuario.create({
        data: {
          email,
          senha: senhaHash,
          nome,
          tipo: 'ADMIN',
          ativo: true
        },
        select: {
          id: true,
          email: true,
          nome: true,
          tipo: true,
          ativo: true,
          criadoEm: true
        }
      });

      res.status(201).json({
        message: 'Primeiro usuário criado com sucesso! Agora você pode fazer login.',
        usuario: primeiroUsuario
      });
      
    } catch (error) {
      console.error('❌ Erro ao criar primeiro usuário:', error);
      
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'Email já está em uso'
        });
      }
      
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
};

export default userController;