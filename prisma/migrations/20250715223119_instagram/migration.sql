/*
  Warnings:

  - A unique constraint covering the columns `[instagramId]` on the table `candidatos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "candidatos" ADD COLUMN     "businessCategoryName" TEXT,
ADD COLUMN     "fbid" TEXT,
ADD COLUMN     "followersCount" INTEGER,
ADD COLUMN     "followsCount" INTEGER,
ADD COLUMN     "hasChannel" BOOLEAN,
ADD COLUMN     "highlightReelCount" INTEGER,
ADD COLUMN     "igtvVideoCount" INTEGER,
ADD COLUMN     "instagramBiography" TEXT,
ADD COLUMN     "instagramExternalUrls" JSONB,
ADD COLUMN     "instagramFullName" TEXT,
ADD COLUMN     "instagramId" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "isBusinessAccount" BOOLEAN,
ADD COLUMN     "joinedRecently" BOOLEAN,
ADD COLUMN     "postsCount" INTEGER,
ADD COLUMN     "private" BOOLEAN,
ADD COLUMN     "profilePicUrl" TEXT,
ADD COLUMN     "profilePicUrlHD" TEXT,
ADD COLUMN     "ultimoScrapingEm" TIMESTAMP(3),
ADD COLUMN     "verified" BOOLEAN;

-- CreateTable
CREATE TABLE "publicacoes" (
    "id" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "instagramPostId" TEXT NOT NULL,
    "type" TEXT,
    "shortCode" TEXT,
    "caption" TEXT,
    "url" TEXT,
    "commentsCount" INTEGER,
    "displayUrl" TEXT,
    "likesCount" INTEGER,
    "timestamp" TIMESTAMP(3),
    "ownerUsername" TEXT,
    "ownerId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios" (
    "id" TEXT NOT NULL,
    "publicacaoId" TEXT NOT NULL,
    "instagramCommentId" TEXT NOT NULL,
    "postUrl" TEXT,
    "commentUrl" TEXT,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3),
    "repliesCount" INTEGER,
    "likesCount" INTEGER,
    "ownerUsername" TEXT,
    "ownerProfilePicUrl" TEXT,
    "ownerFullName" TEXT,
    "ownerId" TEXT,
    "ownerFbidV2" TEXT,
    "ownerIsMentionable" BOOLEAN,
    "ownerIsPrivate" BOOLEAN,
    "ownerIsVerified" BOOLEAN,
    "ownerLatestReelMedia" BIGINT,
    "ownerProfilePicId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publicacoes_instagramPostId_key" ON "publicacoes"("instagramPostId");

-- CreateIndex
CREATE UNIQUE INDEX "comentarios_instagramCommentId_key" ON "comentarios"("instagramCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "candidatos_instagramId_key" ON "candidatos"("instagramId");

-- AddForeignKey
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "candidatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_publicacaoId_fkey" FOREIGN KEY ("publicacaoId") REFERENCES "publicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
