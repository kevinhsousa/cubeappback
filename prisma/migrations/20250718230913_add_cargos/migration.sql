-- AlterTable
ALTER TABLE "candidatos" ADD COLUMN     "cargoId" TEXT;

-- AddForeignKey
ALTER TABLE "candidatos" ADD CONSTRAINT "candidatos_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
