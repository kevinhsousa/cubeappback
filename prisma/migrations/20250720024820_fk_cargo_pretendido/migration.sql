/*
  Warnings:

  - You are about to drop the column `cargoPretendido` on the `candidatos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "candidatos" DROP COLUMN "cargoPretendido",
ADD COLUMN     "cargoPretendidoId" TEXT;

-- AddForeignKey
ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_cargoPretendidoId_fkey" FOREIGN KEY ("cargoPretendidoId") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
