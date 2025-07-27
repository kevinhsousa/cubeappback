import { Prisma } from '@prisma/client';

const errorHandler = (error, req, res, next) => {
  console.error('🚨 Erro capturado:', error);

  // Erro do Prisma - Violação de constraint única
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'campo';
      return res.status(400).json({
        error: `${field} já está em uso`,
        code: 'DUPLICATE_FIELD'
      });
    }
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Registro não encontrado',
        code: 'NOT_FOUND'
      });
    }
  }

  // Erro de validação do Prisma
  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: 'Dados inválidos fornecidos',
      code: 'VALIDATION_ERROR'
    });
  }

  // Erro de conexão com banco
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      error: 'Erro de conexão com o banco de dados',
      code: 'DATABASE_CONNECTION_ERROR'
    });
  }

  // Erro genérico
  return res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

export { errorHandler };