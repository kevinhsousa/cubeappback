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
        //  VALIDAR URL antes de enviar
        if (!postUrl || !postUrl.includes('instagram.com')) {
            throw new Error(`URL inválida: ${postUrl}`);
        }

        console.log(`🚀 Coletando comentários para: ${postUrl}`);

        //  DETECTAR se é URL de post ou reel
        const isReel = postUrl.includes('/reel/');
        const isPost = postUrl.includes('/p/');

        if (!isReel && !isPost) {
            throw new Error('URL deve ser de um post (/p/) ou reel (/reel/)');
        }

        const input = {
            "directUrls": [postUrl],
            "resultsType": "comments",
            "resultsLimit": 50, //  REDUZIR para evitar timeout
            "addParentData": false
        };

        console.log(`📝 Input enviado:`, input);
        
        const run = await apifyClient.actor("shu8hvrXbJbY3Eb9W").call(input);
        
        //  AGUARDAR conclusão com timeout
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
        
        //  VERIFICAR se tem dados válidos
        if (items.length === 0) {
            console.log('📭 Nenhum comentário encontrado (post pode estar privado ou sem comentários)');
            return [];
        }

        //  FILTRAR comentários válidos
        const comentariosValidos = items.filter(item => 
            item.text && 
            item.text.trim().length > 0 && 
            item.id
        );

        console.log(` ${comentariosValidos.length} comentários válidos de ${items.length} total`);
        return comentariosValidos;
        
    } catch (error) {
        console.error('❌ Erro no Apify (comentários):', error.message);
        
        //  NÃO quebrar o fluxo - retornar array vazio
        if (error.message.includes('Empty or private data')) {
            console.log('📝 Post privado ou sem dados - continuando...');
            return [];
        }
        
        throw error;
    }
};

//  CORRIGIR: Salvar comentários (função estava faltando)
const salvarComentarios = async (publicacaoId, comentarios) => {
    try {
        let comentariosSalvos = 0;
        let comentariosExistentes = 0;

        for (const comentario of comentarios) {
            try {
                // Verificar se já existe
                const existe = await prisma.comentarios.findUnique({
                    where: { instagramCommentId: comentario.id }
                });

                if (existe) {
                    comentariosExistentes++;
                    continue;
                }

                // Criar novo comentário
                await prisma.comentarios.create({
                    data: {
                        publicacaoId,
                        instagramCommentId: comentario.id,
                        text: comentario.text,
                        likesCount: comentario.likesCount || 0,
                        ownerUsername: comentario.ownerUsername,
                        ownerIsVerified: comentario.ownerIsVerified || false,
                        timestamp: comentario.timestamp ? new Date(comentario.timestamp) : new Date()
                    }
                });

                comentariosSalvos++;
            } catch (comentarioError) {
                console.error(`❌ Erro ao salvar comentário ${comentario.id}:`, comentarioError.message);
                // Continuar com outros comentários
            }
        }

        return { comentariosSalvos, comentariosExistentes };
    } catch (error) {
        console.error('❌ Erro ao salvar comentários:', error.message);
        return { comentariosSalvos: 0, comentariosExistentes: 0 };
    }
};

//  CORRIGIR: Processar próximo candidato com query simples
export const processarProximoCandidatoComentarios = async () => {
    try {
        console.log('🔍 Buscando publicações para processar comentários...');
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        //  QUERY SIMPLES: Buscar publicações que precisam de comentários
        const publicacao = await prisma.publicacoes.findFirst({
            where: {
                candidato: {
                    ativo: true,
                    instagramHandle: { not: null }
                },
                url: { not: null },
                OR: [
                    // 1. Nunca processou comentários
                    { comentariosProcessadosEm: null },
                    // 2. Processou há mais de 24h
                    { comentariosProcessadosEm: { lt: oneDayAgo } }
                ]
            },
            orderBy: [
                { comentariosProcessadosEm: { sort: 'asc', nulls: 'first' } },
                { commentsCount: 'desc' },
                { timestamp: 'desc' }
            ],
            include: {
                candidato: {
                    select: { nome: true, instagramHandle: true }
                },
                _count: {
                    select: { comentarios: true }
                }
            }
        });

        if (!publicacao) {
            console.log(' Nenhuma publicação pendente para comentários');
            return null;
        }

        const comentariosSalvos = publicacao._count.comentarios;
        const comentariosDisponiveis = publicacao.commentsCount || 0;
        
        console.log(`🎯 Processando: ${publicacao.candidato.nome} - ${publicacao.shortCode}`);
        console.log(`📊 Comentários: ${comentariosSalvos} salvos / ${comentariosDisponiveis} disponíveis`);
        
        const resultado = await processarComentariosPublicacao(publicacao.id);
        
        //  MARCAR como processado independente do resultado
        await prisma.publicacoes.update({
            where: { id: publicacao.id },
            data: { comentariosProcessadosEm: new Date() }
        });
        
        return resultado;

    } catch (error) {
        console.error('❌ Erro ao processar próximo candidato:', error.message);
        return null;
    }
};

//  ATUALIZAR: Processar comentários com melhor lógica
export const processarComentariosPublicacao = async (publicacaoId) => {
    try {
        const publicacao = await prisma.publicacoes.findUnique({
            where: { id: publicacaoId },
            include: {
                candidato: {
                    select: { nome: true, instagramHandle: true }
                },
                _count: {
                    select: { comentarios: true }
                }
            }
        });

        if (!publicacao) {
            throw new Error('Publicação não encontrada');
        }

        const comentariosSalvosAntes = publicacao._count.comentarios;
        console.log(`📄 Processando: ${publicacao.shortCode} de ${publicacao.candidato.nome} (${comentariosSalvosAntes} comentários já salvos)`);

        if (!publicacao.url) {
            console.log('❌ URL da publicação não encontrada');
            return { comentariosSalvos: 0, comentariosExistentes: comentariosSalvosAntes };
        }

        // Coletar comentários via Apify
        const comentarios = await coletarComentariosApify(publicacao.url);
        
        if (comentarios.length === 0) {
            console.log('📭 Nenhum comentário coletado (pode ser post recente ou privado)');
            return { comentariosSalvos: 0, comentariosExistentes: comentariosSalvosAntes };
        }

        // Salvar comentários (incluindo novos)
        const resultado = await salvarComentarios(publicacao.id, comentarios);
        
        const totalComentarios = comentariosSalvosAntes + resultado.comentariosSalvos;
        
        console.log(` Processamento concluído: ${resultado.comentariosSalvos} novos comentários (${totalComentarios} total)`);
        
        //  SE temos comentários suficientes, fazer análise de sentimento
        if (totalComentarios >= 3) { // Mínimo 3 comentários para análise
            try {
                console.log(`🧠 Iniciando análise de sentimento (${totalComentarios} comentários)...`);
                const analiseExistente = await prisma.analisesSentimento.findFirst({
                    where: {
                        publicacaoId,
                        tipoAnalise: 'COMENTARIOS'
                    }
                });

                if (!analiseExistente) {
                    await analisarSentimentoComentarios(publicacaoId);
                    
                    // Marcar sentimento como processado
                    await prisma.publicacoes.update({
                        where: { id: publicacaoId },
                        data: { sentimentoProcessadoEm: new Date() }
                    });
                    
                    console.log(` Análise de sentimento concluída!`);
                } else {
                    console.log(`ℹ️ Análise de sentimento já existe`);
                }
            } catch (sentimentoError) {
                console.error('❌ Erro na análise de sentimento:', sentimentoError.message);
                // Não quebrar o fluxo principal
            }
        } else {
            console.log(`⏳ Aguardando mais comentários para análise (mínimo 3, atual: ${totalComentarios})`);
        }
        
        return {
            publicacao: {
                id: publicacao.id,
                shortCode: publicacao.shortCode,
                candidato: publicacao.candidato.nome
            },
            comentariosSalvos: resultado.comentariosSalvos,
            comentariosExistentes: comentariosSalvosAntes + resultado.comentariosExistentes,
            totalComentarios,
            analiseSentimentoRealizada: totalComentarios >= 3
        };
        
    } catch (error) {
        console.error('❌ Erro ao processar comentários:', error.message);
        throw error;
    }
};

//  SIMPLIFICAR: Reprocessar publicações com potencial
export const reprocessarPublicacoesComPotencial = async () => {
    try {
        console.log('🔄 Buscando publicações com potencial para novos comentários...');
        
        const ultimasSemanas = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 2 semanas
        const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        //  QUERY SIMPLES: Buscar publicações recentes que podem ter ganhado comentários
        const publicacoesComPotencial = await prisma.publicacoes.findMany({
            where: {
                candidato: { ativo: true },
                timestamp: { gte: ultimasSemanas },
                commentsCount: { gt: 0 },
                comentariosProcessadosEm: { lt: umDiaAtras },
                url: { not: null }
            },
            include: {
                candidato: { select: { nome: true } },
                _count: { select: { comentarios: true } }
            },
            orderBy: { commentsCount: 'desc' },
            take: 5 //  REDUZIR para 5 por vez
        });

        if (publicacoesComPotencial.length === 0) {
            console.log(' Nenhuma publicação com potencial encontrada');
            return { processadas: 0 };
        }

        console.log(`🎯 Encontradas ${publicacoesComPotencial.length} publicações com potencial`);
        
        let processadas = 0;
        
        for (const pub of publicacoesComPotencial) {
            const comentariosSalvos = pub._count.comentarios;
            const comentariosDisponiveis = pub.commentsCount || 0;
            
            // Só reprocessar se há diferença significativa (pelo menos 2 comentários de diferença)
            if (comentariosDisponiveis > comentariosSalvos + 1) {
                console.log(`🔄 Reprocessando ${pub.shortCode} (${comentariosSalvos}/${comentariosDisponiveis} comentários)`);
                
                try {
                    await processarComentariosPublicacao(pub.id);
                    processadas++;
                    
                    // Delay entre processamentos
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } catch (error) {
                    console.error(`❌ Erro ao reprocessar ${pub.shortCode}:`, error.message);
                }
            }
        }
        
        console.log(` Reprocessamento concluído: ${processadas} publicações`);
        return { processadas };
        
    } catch (error) {
        console.error('❌ Erro no reprocessamento:', error.message);
        return { processadas: 0 };
    }
};

//  CORRIGIR: Estatísticas mais simples
export const obterEstatisticasComentarios = async () => {
    try {
        //  Contar publicações total
        const totalPublicacoes = await prisma.publicacoes.count();

        //  Contar publicações com comentários salvos
        const publicacoesComComentarios = await prisma.publicacoes.count({
            where: {
                comentarios: { some: {} }
            }
        });

        //  Somar comentários disponíveis vs salvos
        const statsComentarios = await prisma.publicacoes.aggregate({
            _sum: { commentsCount: true }
        });

        const totalComentariosSalvos = await prisma.comentarios.count();

        //  Estatísticas de reprocessamento
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        
        const publicacoesComPotencial = await prisma.publicacoes.count({
            where: {
                candidato: { ativo: true },
                commentsCount: { gt: 0 },
                comentariosProcessadosEm: { lt: oneDayAgo },
                timestamp: { gte: twoWeeksAgo }
            }
        });

        const comentariosDisponiveis = statsComentarios._sum.commentsCount || 0;
        const pendentes = totalPublicacoes - publicacoesComComentarios;

        return {
            totalPublicacoes,
            publicacoesComComentarios,
            publicacoesPendentes: pendentes,
            publicacoesComPotencial,
            totalComentariosDisponiveis: comentariosDisponiveis,
            totalComentariosSalvos,
            eficienciaColeta: comentariosDisponiveis > 0 ? 
                ((totalComentariosSalvos / comentariosDisponiveis) * 100).toFixed(1) : '0',
            percentualCompleto: totalPublicacoes > 0 ? 
                ((publicacoesComComentarios / totalPublicacoes) * 100).toFixed(1) : '0'
        };
        
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error.message);
        return {
            totalPublicacoes: 0,
            publicacoesComComentarios: 0,
            publicacoesPendentes: 0,
            publicacoesComPotencial: 0,
            totalComentariosDisponiveis: 0,
            totalComentariosSalvos: 0,
            eficienciaColeta: '0',
            percentualCompleto: '0'
        };
    }
};