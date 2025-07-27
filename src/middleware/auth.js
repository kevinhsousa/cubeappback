import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar se o usuário ainda existe e está ativo
    const user = await prisma.usuario.findUnique({
      where: { 
        id: decoded.userId,
        ativo: true 
      },
      select: {
        id: true,
        email: true,
        nome: true,
        tipo: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expirado' });
    }
    
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.tipo !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

export {
  authenticateToken,
  requireAdmin
};