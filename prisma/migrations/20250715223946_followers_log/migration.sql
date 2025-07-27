-- CreateEnum
CREATE TYPE "TipoColeta" AS ENUM ('AUTOMATICA', 'MANUAL');

-- CreateTable
CREATE TABLE "historico_seguidores" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "followersCount" INTEGER NOT NULL,
    "followsCount" INTEGER NOT NULL,
    "postsCount" INTEGER,
    "igtvVideoCount" INTEGER,
    "highlightReelCount" INTEGER,
    "dataColeta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipoColeta" "TipoColeta" NOT NULL DEFAULT 'AUTOMATICA',
    "variacaoSeguidores" INTEGER,
    "percentualVariacao" DOUBLE PRECISION,
    "diasEntreMedicoes" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_seguidores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_seguidores_candidatoId_dataColeta_idx" ON "historico_seguidores"("candidatoId", "dataColeta");

-- AddForeignKey
ALTER TABLE "historico_seguidores" ADD CONSTRAINT "historico_seguidores_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
