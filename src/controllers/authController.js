import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios' 
      });
    }

    // Buscar usuário
    const user = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.ativo) {
      return res.status(401).json({ 
        error: 'Credenciais inválidas' 
      });
    }

    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.senha);
    if (!validPassword) {
      return res.status(401).json({ 
        error: 'Credenciais inválidas' 
      });
    }

    // Gerar JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Resposta (sem senha)
    const { senha, ...userWithoutPassword } = user;
    
    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    next(error);
  }
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { email, password, nome } = req.body;

    // Validação básica
    if (!email || !password || !nome) {
      return res.status(400).json({ 
        error: 'Email, senha e nome são obrigatórios' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Senha deve ter pelo menos 6 caracteres' 
      });
    }

    // Verificar se já existe algum admin
    const existingAdmin = await prisma.usuario.findFirst({
      where: { tipo: 'ADMIN' }
    });

    if (existingAdmin) {
      return res.status(403).json({ 
        error: 'Administrador já existe no sistema' 
      });
    }

    // Hash da senha
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Criar usuário
    const user = await prisma.usuario.create({
      data: {
        email: email.toLowerCase(),
        senha: hashedPassword,
        nome,
        tipo: 'ADMIN'
      }
    });

    // Resposta (sem senha)
    const { senha, ...userWithoutPassword } = user;
    
    res.status(201).json({
      message: 'Administrador criado com sucesso',
      user: userWithoutPassword
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
const getProfile = async (req, res) => {
  res.json({ user: req.user });
};

// POST /api/auth/logout
const logout = async (req, res) => {
  // Como usamos JWT stateless, o logout é feito no frontend
  res.json({ message: 'Logout realizado com sucesso' });
};

export default {
  login,
  register,
  getProfile,
  logout
};