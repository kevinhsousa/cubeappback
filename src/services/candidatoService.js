// services/candidatoService.js
import { PrismaClient } from '@prisma/client';
import { analisarViabilidadeCandidato } from './viabilidadeService.js';

const prisma = new PrismaClient();

export const atualizarDadosInstagram = async (candidatoId, dadosApify) => {
    try {
        // Atualizar dados do candidato
        const candidatoAtualizado = await prisma.candidato.update({
            where: { id: candidatoId },
            data: {
                instagramId: dadosApify.id,
                instagramUrl: dadosApify.url,
                instagramFullName: dadosApify.fullName,
                instagramBiography: dadosApify.biography,
                instagramExternalUrls: dadosApify.externalUrls,
                followersCount: dadosApify.followersCount,
                followsCount: dadosApify.followsCount,
                hasChannel: dadosApify.hasChannel,
                highlightReelCount: dadosApify.highlightReelCount,
                isBusinessAccount: dadosApify.isBusinessAccount,
                joinedRecently: dadosApify.joinedRecently,
                businessCategoryName: dadosApify.businessCategoryName,
                private: dadosApify.private,
                verified: dadosApify.verified,
                profilePicUrl: dadosApify.profilePicUrl,
                profilePicUrlHD: dadosApify.profilePicUrlHD,
                igtvVideoCount: dadosApify.igtvVideoCount,
                postsCount: dadosApify.postsCount,
                fbid: dadosApify.fbid,
                ultimoScrapingEm: new Date(),
            }
        });

        // Criar registro no histórico
        await criarHistoricoSeguidores(candidatoId, dadosApify);

        // 🆕 NOVO: Salvar publicações se existirem
        if (dadosApify.latestPosts && dadosApify.latestPosts.length > 0) {
            await salvarPublicacoes(candidatoId, dadosApify.latestPosts);
        }

        // 🆕 ANÁLISE DE VIABILIDADE AUTOMÁTICA
        try {
            console.log(`🎯 Iniciando análise de viabilidade automaticamente...`);
            await analisarViabilidadeCandidato(candidatoId);
            console.log(`✅ Análise de viabilidade concluída!`);
        } catch (viabilidadeError) {
            console.error('❌ Erro na análise de viabilidade:', viabilidadeError.message);
            // Não quebrar o fluxo principal se a análise falhar
        }

        return candidatoAtualizado;
    } catch (error) {
        console.error('❌ Erro ao atualizar candidato:', error.message);
        throw error;
    }
};

// 🆕 NOVA FUNÇÃO: Salvar publicações
const salvarPublicacoes = async (candidatoId, posts) => {
    try {
        console.log(`📄 Salvando ${posts.length} publicações...`);
        
        for (const post of posts) {
            try {
                // Verificar se a publicação já existe
                const existePublicacao = await prisma.publicacoes.findUnique({
                    where: { instagramPostId: post.id }
                });

                if (existePublicacao) {
                    console.log(`📄 Post ${post.shortCode} já existe, atualizando...`);
                    
                    // Atualizar publicação existente
                    await prisma.publicacoes.update({
                        where: { instagramPostId: post.id },
                        data: {
                            commentsCount: post.commentsCount,
                            likesCount: post.likesCount,
                            videoViewCount: post.videoViewCount || null,
                            atualizadoEm: new Date()
                        }
                    });
                } else {
                    console.log(`📄 Criando nova publicação: ${post.shortCode}`);
                    
                    // Criar nova publicação
                    await prisma.publicacoes.create({
                        data: {
                            candidatoId,
                            instagramPostId: post.id,
                            type: post.type,
                            shortCode: post.shortCode,
                            caption: post.caption,
                            hashtags: post.hashtags || [],
                            mentions: post.mentions || [],
                            url: post.url,
                            commentsCount: post.commentsCount,
                            displayUrl: post.displayUrl,
                            likesCount: post.likesCount,
                            timestamp: post.timestamp ? new Date(post.timestamp) : null,
                            ownerUsername: post.ownerUsername,
                            ownerId: post.ownerId,
                            dimensionsHeight: post.dimensionsHeight,
                            dimensionsWidth: post.dimensionsWidth,
                            images: post.images || [],
                            videoUrl: post.videoUrl,
                            videoViewCount: post.videoViewCount,
                            alt: post.alt,
                            locationName: post.locationName,
                            locationId: post.locationId,
                            productType: post.productType,
                            taggedUsers: post.taggedUsers || [],
                            childPosts: post.childPosts || [],
                            isCommentsDisabled: post.isCommentsDisabled
                        }
                    });
                }
            } catch (postError) {
                console.error(`❌ Erro ao salvar post ${post.shortCode}:`, postError.message);
                // Continue com os outros posts mesmo se um der erro
            }
        }
        
        console.log(`✅ Publicações processadas com sucesso!`);
    } catch (error) {
        console.error('❌ Erro ao salvar publicações:', error.message);
    }
};

const criarHistoricoSeguidores = async (candidatoId, dadosApify) => {
    try {
        // Buscar último registro para calcular variação
        const ultimoRegistro = await prisma.historicoSeguidores.findFirst({
            where: { candidatoId },
            orderBy: { dataColeta: 'desc' }
        });

        let variacaoSeguidores = null;
        let percentualVariacao = null;
        let diasEntreMedicoes = null;

        if (ultimoRegistro) {
            variacaoSeguidores = dadosApify.followersCount - ultimoRegistro.followersCount;
            percentualVariacao = ultimoRegistro.followersCount > 0 
                ? ((variacaoSeguidores / ultimoRegistro.followersCount) * 100)
                : 0;
            
            const diffTime = new Date() - new Date(ultimoRegistro.dataColeta);
            diasEntreMedicoes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        await prisma.historicoSeguidores.create({
            data: {
                candidatoId,
                followersCount: dadosApify.followersCount,
                followsCount: dadosApify.followsCount,
                postsCount: dadosApify.postsCount,
                igtvVideoCount: dadosApify.igtvVideoCount,
                highlightReelCount: dadosApify.highlightReelCount,
                variacaoSeguidores,
                percentualVariacao,
                diasEntreMedicoes,
                tipoColeta: 'AUTOMATICA'
            }
        });

        console.log(`📊 Histórico criado - Seguidores: ${dadosApify.followersCount} (${variacaoSeguidores > 0 ? '+' : ''}${variacaoSeguidores || 0})`);
    } catch (error) {
        console.error('❌ Erro ao criar histórico:', error.message);
        throw error;
    }
};

export const buscarProximoCandidatoParaScraping = async () => {
    try {
        const agora = new Date();
        const doisDiasAtras = new Date();
        doisDiasAtras.setDate(doisDiasAtras.getDate() - 2);

        // Busca candidatos que:
        // 1. Têm instagramHandle preenchido
        // 2. Estão ativos  
        // 3. Não foram processados nos últimos 2 dias OU nunca foram processados
        const candidato = await prisma.candidato.findFirst({
            where: {
                AND: [
                    { instagramHandle: { not: null } },
                    { ativo: true },
                    {
                        OR: [
                            { ultimoScrapingEm: null }, // Nunca foi processado
                            { ultimoScrapingEm: { lt: doisDiasAtras } } // Processado há mais de 2 dias
                        ]
                    }
                ]
            },
            orderBy: [
                { ultimoScrapingEm: { sort: 'asc', nulls: 'first' } }, // Prioriza quem nunca foi processado
                { criadoEm: 'asc' } // Depois por ordem de criação (primeiro criado, primeiro processado)
            ]
        });

        if (candidato) {
            console.log(`🎯 Próximo candidato: ${candidato.nome} (@${candidato.instagramHandle})`);
            
            // Log para debug - quando foi o último scraping
            if (candidato.ultimoScrapingEm) {
                const diasDesdeUltimo = Math.ceil((agora - new Date(candidato.ultimoScrapingEm)) / (1000 * 60 * 60 * 24));
                console.log(`⏱️  Último scraping: ${diasDesdeUltimo} dias atrás`);
            } else {
                console.log(`🆕 Primeira vez sendo processado`);
            }
        }

        return candidato;
    } catch (error) {
        console.error('❌ Erro ao buscar candidato:', error.message);
        throw error;
    }
};

export const obterEstatisticasProcessamento = async () => {
    try {
        const doisDiasAtras = new Date();
        doisDiasAtras.setDate(doisDiasAtras.getDate() - 2);

        const stats = await prisma.candidato.aggregate({
            where: {
                AND: [
                    { instagramHandle: { not: null } },
                    { ativo: true }
                ]
            },
            _count: {
                id: true
            }
        });

        const processadosRecentemente = await prisma.candidato.count({
            where: {
                AND: [
                    { instagramHandle: { not: null } },
                    { ativo: true },
                    { ultimoScrapingEm: { gte: doisDiasAtras } }
                ]
            }
        });

        const nuncaProcessados = await prisma.candidato.count({
            where: {
                AND: [
                    { instagramHandle: { not: null } },
                    { ativo: true },
                    { ultimoScrapingEm: null }
                ]
            }
        });

        const pendentes = stats._count.id - processadosRecentemente;

        return {
            total: stats._count.id,
            processadosRecentemente,
            nuncaProcessados,
            pendentes,
            cicloCompleto: pendentes === 0
        };
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error.message);
        return null;
    }
};

export const buscarCandidatoPorId = async (candidatoId) => {
    try {
        const candidato = await prisma.candidato.findUnique({
            where: { 
                id: candidatoId,
                ativo: true,
                instagramHandle: { not: null }
            }
        });

        if (!candidato) {
            throw new Error('Candidato não encontrado ou sem Instagram configurado');
        }

        return candidato;
    } catch (error) {
        console.error('❌ Erro ao buscar candidato por ID:', error.message);
        throw error;
    }
};