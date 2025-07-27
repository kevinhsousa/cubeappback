-- CreateTable
CREATE TABLE "dominios_rss" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER,
    "cor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dominios_rss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dominios_rss_dominio_key" ON "dominios_rss"("dominio");
