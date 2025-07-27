/*
  Warnings:

  - You are about to drop the column `cargoAtual` on the `candidatos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "candidatos" DROP COLUMN "cargoAtual",
ADD COLUMN     "macrorregiaoId" TEXT;

-- CreateTable
CREATE TABLE "macrorregioes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "macrorregioes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "macrorregioes_nome_key" ON "macrorregioes"("nome");

-- AddForeignKey
ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_macrorregiaoId_fkey" FOREIGN KEY ("macrorregiaoId") REFERENCES "macrorregioes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
