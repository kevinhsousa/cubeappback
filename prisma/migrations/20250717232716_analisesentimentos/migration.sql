-- CreateEnum
CREATE TYPE "TipoAnalise" AS ENUM ('COMENTARIOS', 'PUBLICACAO', 'COMPLETA');

-- CreateEnum
CREATE TYPE "SentimentoLabel" AS ENUM ('POSITIVO', 'NEGATIVO', 'NEUTRO');

-- CreateTable
CREATE TABLE "analises_sentimento" (
    "id" TEXT NOT NULL,
    "publicacaoId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "tipoAnalise" "TipoAnalise" NOT NULL DEFAULT 'COMENTARIOS',
    "sentimentoLabel" "SentimentoLabel" NOT NULL,
    "sentimentoScore" DOUBLE PRECISION NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL,
    "totalComentariosAnalisados" INTEGER,
    "resumoInsights" JSONB,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geminiModel" TEXT,
    "versaoPrompt" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analises_sentimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analises_sentimento_candidatoId_processadoEm_idx" ON "analises_sentimento"("candidatoId", "processadoEm");

-- CreateIndex
CREATE INDEX "analises_sentimento_publicacaoId_idx" ON "analises_sentimento"("publicacaoId");

-- AddForeignKey
ALTER TABLE "analises_sentimento" ADD CONSTRAINT "analises_sentimento_publicacaoId_fkey" FOREIGN KEY ("publicacaoId") REFERENCES "publicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_sentimento" ADD CONSTRAINT "analises_sentimento_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
