/*
  Warnings:

  - You are about to drop the column `ativo` on the `insights_estrategicos` table. All the data in the column will be lost.
  - You are about to drop the column `categoria` on the `insights_estrategicos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "insights_estrategicos" DROP COLUMN "ativo",
DROP COLUMN "categoria";

-- DropEnum
DROP TYPE "CategoriaInsight";
