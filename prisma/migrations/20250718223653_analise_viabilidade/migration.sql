-- CreateEnum
CREATE TYPE "ViabilidadeCategoria" AS ENUM ('ALTA', 'MEDIA', 'RISCO', 'CRITICO');

-- CreateTable
CREATE TABLE "analises_viabilidade" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "scoreViabilidade" DOUBLE PRECISION NOT NULL,
    "categoria" "ViabilidadeCategoria" NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL,
    "dadosQuantitativos" JSONB NOT NULL,
    "resumoSentimento" JSONB NOT NULL,
    "justificativa" TEXT NOT NULL,
    "pontosFortes" JSONB NOT NULL,
    "pontosAtencao" JSONB NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geminiModel" TEXT,
    "versaoPrompt" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analises_viabilidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analises_viabilidade_candidatoId_processadoEm_idx" ON "analises_viabilidade"("candidatoId", "processadoEm");

-- AddForeignKey
ALTER TABLE "analises_viabilidade" ADD CONSTRAINT "analises_viabilidade_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
