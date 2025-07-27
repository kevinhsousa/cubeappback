-- CreateTable
CREATE TABLE "simulador_cenarios" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipoCanditato" TEXT NOT NULL,
    "scoreCube" DOUBLE PRECISION NOT NULL,
    "gapEleitoral" DOUBLE PRECISION NOT NULL,
    "deficitEngajamento" DOUBLE PRECISION NOT NULL,
    "incerteza" DOUBLE PRECISION NOT NULL,
    "cenarioOtimista" INTEGER NOT NULL,
    "cenarioRealista" INTEGER NOT NULL,
    "cenarioPessimista" INTEGER NOT NULL,
    "parametrosCalculo" JSONB NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versaoAlgoritmo" TEXT NOT NULL DEFAULT 'v1.0',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulador_cenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulador_cenarios_candidatoId_processadoEm_idx" ON "simulador_cenarios"("candidatoId", "processadoEm");

-- AddForeignKey
ALTER TABLE "simulador_cenarios" ADD CONSTRAINT "simulador_cenarios_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
