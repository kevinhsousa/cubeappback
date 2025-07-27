# Use Node.js 18 Alpine para otimização
FROM node:18-alpine

# Instalar dependências do sistema incluindo OpenSSL
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client \
    openssl \
    openssl-dev

# Definir variável de ambiente para OpenSSL
ENV OPENSSL_ROOT_DIR=/usr

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências
RUN npm install --omit=dev

# Copiar código fonte
COPY . .

# Gerar cliente Prisma
RUN npx prisma generate

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Mudar ownership dos arquivos
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expor porta
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["npm", "start"]
