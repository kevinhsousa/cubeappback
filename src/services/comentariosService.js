// services/comentariosService.js - VERSÃO CORRIGIDA
import { PrismaClient } from '@prisma/client';
import { ApifyClient } from 'apify-client';
import { analisarSentimentoComentarios } from './sentimentoService.js';

const prisma = new PrismaClient();
const apifyClient = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

// Coletar comentários via Apify com validações
export const coletarComentariosApify = async (postUrl) => {
    try {
        // ✅ VALIDAR URL antes de enviar
        if (!postUrl || !postUrl.includes('instagram.com')) {
            throw new Error(`URL inválida: ${postUrl}`);
        }

        console.log(`🚀 Coletando comentários para: ${postUrl}`);

        // ✅ DETECTAR se é URL de post ou reel
        const isReel = postUrl.includes('/reel/');
        const isPost = postUrl.includes('/p/');

        if (!isReel && !isPost) {
            throw new Error('URL deve ser de um post (/p/) ou reel (/reel/)');
        }

        const input = {
            "directUrls": [postUrl],
            "resultsType": "comments",
            "resultsLimit": 50, // ✅ REDUZIR para evitar timeout
            "addParentData": false
        };

        console.log(`📝 Input enviado:`, input);
        
        const run = await apifyClient.actor("shu8hvrXbJbY3Eb9W").call(input);
        
        // ✅ AGUARDAR conclusão com timeout
        const maxWaitTime = 120000; // 2 minutos
        const startTime = Date.now();
        
        let runInfo;
        do {
            runInfo = await apifyClient.run(run.id).get();
            if (runInfo.status === 'FAILED') {
                throw new Error(`Apify run failed: ${runInfo.exitCode}`);
            }
            if (Date.now() - startTime > maxWaitTime) {
                throw new Error('Timeout aguardando Apify');
            }
            if (runInfo.status !== 'SUCCEEDED') {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } while (runInfo.status === 'RUNNING');

        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
        
        console.log(`💬 ${items.length} comentários coletados`);
        
        // ✅ VERIFICAR se tem dados válidos
        if (items.length === 0) {
            console.log('📭 Nenhum comentário encontrado (post pode estar privado ou sem comentários)');
            return [];
        }

        // ✅ FILTRAR comentários válidos
        const comentariosValidos = items.filter(item => 
            item.text && 
            item.text.trim().length > 0 && 
            item.id
        );

        console.log(`✅ ${comentariosValidos.length} comentários válidos de ${items.length} total`);
        return comentariosValidos;
        
    } catch (error) {
        console.error('❌ Erro no Apify (comentários):', error.message);
        
        // ✅ NÃO quebrar o fluxo - retornar array vazio
        if (error.message.includes('Empty or private data')) {
            console.log('📝 Post privado ou sem dados - continuando...');
            return [];
        }
        
        throw error;
    }
};

// Processar comentários com melhor tratamento de erro
export const processarComentariosPublicacao = async (publicacaoId) => {
    try {
        const publicacao = await prisma.publicacoes.findUnique({
            where: { id: publicacaoId },
            include: {
                candidato: {
                    select: { nome: true, instagramHandle: true }
                }
            }
        });

        if (!publicacao) {
            throw new Error('Publicação não encontrada');
        }

        console.log(`📄 Processando: ${publicacao.shortCode} de ${publicacao.candidato.nome}`);

        // ✅ VERIFICAR se URL existe
        if (!publicacao.url) {
            console.log('❌ URL da publicação não encontrada');
            return { comentariosSalvos: 0, comentariosExistentes: 0 };
        }

        // Coletar comentários via Apify
        const comentarios = await coletarComentariosApify(publicacao.url);
        
        if (comentarios.length === 0) {
            console.log('📭 Nenhum comentário para processar');
            // ✅ MARCAR como processado mesmo sem comentários
            await prisma.publicacoes.update({
                where: { id: publicacao.id },
                data: { atualizadoEm: new Date() }
            });
            return { comentariosSalvos: 0, comentariosExistentes: 0 };
        }

        // Salvar comentários
        const resultado = await salvarComentarios(publicacao.id, comentarios);
        
        console.log(`✅ Processamento concluído: ${resultado.comentariosSalvos} novos comentários`);
        try {
            console.log(`🧠 Iniciando análise de sentimento automaticamente...`);
            await analisarSentimentoComentarios(publicacaoId);
            console.log(`✅ Análise de sentimento concluída!`);
        } catch (sentimentoError) {
            console.error('❌ Erro na análise de sentimento:', sentimentoError.message);
            // Não quebrar o fluxo principal
        }
        return {
            publicacao: {
                id: publicacao.id,
                shortCode: publicacao.shortCode,
                candidato: publicacao.candidato.nome
            },
            ...resultado
        };
        
    } catch (error) {
        console.error('❌ Erro ao processar comentários:', error.message);
        throw error;
    }
};

// Processar próximo candidato com melhor lógica
export const processarProximoCandidatoComentarios = async () => {
    try {
        console.log('🔍 Buscando publicações para processar comentários...');
        
        // ✅ BUSCAR publicações sem comentários há pelo menos 24h
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const publicacao = await prisma.publicacoes.findFirst({
            where: {
                candidato: {
                    ativo: true,
                    instagramHandle: { not: null }
                },
                url: { not: null }, // ✅ SÓ pegar com URL válida
                OR: [
                    {
                        comentarios: { none: {} } // Nunca processou
                    },
                    {
                        AND: [
                            { comentarios: { none: {} } },
                            { atualizadoEm: { lt: oneDayAgo } }
                        ]
                    }
                ]
            },
            orderBy: [
                { timestamp: 'desc' }, // Posts mais recentes primeiro
                { likesCount: 'desc' }  // Posts com mais likes
            ],
            include: {
                candidato: {
                    select: { nome: true, instagramHandle: true }
                }
            }
        });

        if (!publicacao) {
            console.log('✅ Nenhuma publicação pendente para comentários');
            return null;
        }

        console.log(`🎯 Processando: ${publicacao.candidato.nome} - ${publicacao.shortCode}`);
        return await processarComentariosPublicacao(publicacao.id);

    } catch (error) {
        console.error('❌ Erro ao processar próximo candidato:', error.message);
        return null; // ✅ NÃO quebrar o cronjob
    }
};

// Resto das funções continuam iguais...
export const salvarComentarios = async (publicacaoId, comentarios) => {
    try {
        console.log(`💾 Salvando ${comentarios.length} comentários...`);
        
        let comentariosSalvos = 0;
        let comentariosExistentes = 0;
        
        for (const comentario of comentarios) {
            try {
                const existeComentario = await prisma.comentarios.findUnique({
                    where: { instagramCommentId: comentario.id }
                });

                if (existeComentario) {
                    comentariosExistentes++;
                    continue;
                }

                await prisma.comentarios.create({
                    data: {
                        publicacaoId,
                        instagramCommentId: comentario.id,
                        postUrl: comentario.postUrl,
                        commentUrl: comentario.commentUrl,
                        text: comentario.text,
                        timestamp: comentario.timestamp ? new Date(comentario.timestamp) : null,
                        repliesCount: comentario.repliesCount,
                        likesCount: comentario.likesCount,
                        
                        ownerUsername: comentario.ownerUsername,
                        ownerProfilePicUrl: comentario.ownerProfilePicUrl,
                        ownerFullName: comentario.owner?.full_name,
                        ownerId: comentario.owner?.id,
                        ownerFbidV2: comentario.owner?.fbid_v2,
                        ownerIsMentionable: comentario.owner?.is_mentionable,
                        ownerIsPrivate: comentario.owner?.is_private,
                        ownerIsVerified: comentario.owner?.is_verified,
                        ownerLatestReelMedia: comentario.owner?.latest_reel_media ? 
                            BigInt(comentario.owner.latest_reel_media) : null,
                        ownerProfilePicId: comentario.owner?.profile_pic_id,
                    }
                });
                
                comentariosSalvos++;
                
            } catch (comentarioError) {
                console.error(`❌ Erro ao salvar comentário ${comentario.id}:`, comentarioError.message);
            }
        }
        
        console.log(`✅ Comentários: ${comentariosSalvos} novos, ${comentariosExistentes} já existiam`);
        return { comentariosSalvos, comentariosExistentes };
        
    } catch (error) {
        console.error('❌ Erro ao salvar comentários:', error.message);
        throw error;
    }
};

export const obterEstatisticasComentarios = async () => {
    try {
        const statsPublicacoes = await prisma.publicacoes.aggregate({
            _count: { id: true }
        });

        const publicacoesComComentarios = await prisma.publicacoes.count({
            where: {
                comentarios: {
                    some: {}
                }
            }
        });

        const totalComentarios = await prisma.comentarios.aggregate({
            _count: { id: true }
        });

        const pendentes = statsPublicacoes._count.id - publicacoesComComentarios;

        return {
            totalPublicacoes: statsPublicacoes._count.id,
            publicacoesComComentarios,
            publicacoesPendentes: pendentes,
            totalComentarios: totalComentarios._count.id,
            percentualCompleto: statsPublicacoes._count.id > 0 ? 
                ((publicacoesComComentarios / statsPublicacoes._count.id) * 100).toFixed(1) : 0
        };
        
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error.message);
        return null;
    }
};