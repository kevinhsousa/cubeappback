-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('ADMIN', 'USUARIO');

-- CreateEnum
CREATE TYPE "CategoriaInsight" AS ENUM ('ESTRATEGICO', 'RECOMENDACAO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoUsuario" NOT NULL DEFAULT 'ADMIN',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidatos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "foto" TEXT,
    "cargoAtual" TEXT,
    "redutoOrigem" TEXT,
    "votosUltimaEleicao" INTEGER,
    "cargoPretendido" TEXT,
    "votosNecessarios" INTEGER,
    "pontuacaoViabilidade" DOUBLE PRECISION,
    "instagramHandle" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "candidatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights_estrategicos" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "categoria" "CategoriaInsight" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "insights_estrategicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- AddForeignKey
ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights_estrategicos" ADD CONSTRAINT "insights_estrategicos_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights_estrategicos" ADD CONSTRAINT "insights_estrategicos_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "candidatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
