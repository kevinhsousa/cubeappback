// services/sentimentoService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configuração do modelo Gemini
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 1,
        maxOutputTokens: 1200,
    }
});

//  ADICIONAR FUNÇÃO DE CONFIANÇA OBJETIVA (correlacionada com o score)
const calcularConfiancaObjetiva = (comentariosFiltrados, analiseIA) => {
    let confianca = 0.2; // Base baixa
    
    //  Fator 1: Quantidade de comentários
    if (comentariosFiltrados.length >= 50) confianca += 0.25;
    else if (comentariosFiltrados.length >= 30) confianca += 0.20;
    else if (comentariosFiltrados.length >= 20) confianca += 0.15;
    else if (comentariosFiltrados.length >= 10) confianca += 0.10;
    else if (comentariosFiltrados.length >= 5) confianca += 0.05;
    
    //  Fator 2: Diversidade de usuários (evitar spam/bots)
    const usuariosUnicos = new Set(comentariosFiltrados.map(c => c.ownerUsername)).size;
    const diversidadeUsuarios = comentariosFiltrados.length > 0 ? usuariosUnicos / comentariosFiltrados.length : 0;
    if (diversidadeUsuarios > 0.8) confianca += 0.15;
    else if (diversidadeUsuarios > 0.6) confianca += 0.10;
    else if (diversidadeUsuarios > 0.4) confianca += 0.05;
    else confianca -= 0.05; // Muita repetição = menos confiável
    
    //  Fator 3: Qualidade dos comentários
    const tamanhoMedio = comentariosFiltrados.reduce((acc, c) => acc + c.text.length, 0) / comentariosFiltrados.length;
    if (tamanhoMedio > 80) confianca += 0.10;
    else if (tamanhoMedio > 40) confianca += 0.05;
    else if (tamanhoMedio < 15) confianca -= 0.05;
    
    //  Fator 4: Usuários verificados
    const verificados = comentariosFiltrados.filter(c => c.ownerIsVerified).length;
    if (verificados > 0) {
        confianca += Math.min(verificados * 0.02, 0.08);
    }
    
    //  Fator 5: Engajamento (comentários com likes)
    const comLikes = comentariosFiltrados.filter(c => (c.likesCount || 0) > 0).length;
    const percentualComLikes = comLikes / comentariosFiltrados.length;
    if (percentualComLikes > 0.5) confianca += 0.05;
    else if (percentualComLikes > 0.2) confianca += 0.02;
    
    //  FATOR CRÍTICO: Correlação com o score (scores extremos sem evidência = baixa confiança)
    const scoreAbsoluto = Math.abs(analiseIA.sentimentoScore);
    if (scoreAbsoluto > 0.8) {
        // Score muito alto precisa de muita evidência
        if (comentariosFiltrados.length < 20) confianca -= 0.15;
        else if (comentariosFiltrados.length < 10) confianca -= 0.25;
    } else if (scoreAbsoluto > 0.6) {
        // Score alto precisa de evidência moderada
        if (comentariosFiltrados.length < 10) confianca -= 0.10;
        else if (comentariosFiltrados.length < 5) confianca -= 0.20;
    } else if (scoreAbsoluto < 0.1) {
        // Score muito neutro pode indicar indecisão
        confianca -= 0.05;
    } else {
        // Scores moderados são mais confiáveis
        confianca += 0.05;
    }
    
    //  Limitar entre 0.1 e 0.9 (nunca 100% confiável)
    return Math.max(0.1, Math.min(0.9, confianca));
};

export const analisarSentimentoComentarios = async (publicacaoId) => {
    try {
        console.log(`🧠 Iniciando análise de sentimento para publicação: ${publicacaoId}`);

        // Buscar publicação e seus comentários
        const publicacao = await prisma.publicacoes.findUnique({
            where: { id: publicacaoId },
            include: {
                candidato: {
                    select: {
                        id: true,
                        nome: true,
                        instagramHandle: true,
                        instagramBiography: true,
                        followersCount: true,
                        verified: true,
                        cargo: {
                            select: { nome: true, nivel: true }
                        },
                        cargoPretendido: {
                            select: { nome: true, nivel: true }
                        },
                        macrorregiao: {
                            select: { nome: true }
                        }
                    }
                },
                comentarios: {
                    select: {
                        text: true,
                        likesCount: true,
                        ownerUsername: true,
                        ownerIsVerified: true,
                        timestamp: true
                    },
                    orderBy: [
                        { likesCount: 'desc' },
                        { timestamp: 'desc' }
                    ],
                    take: 100 // Aumentar limite para melhor análise
                }
            }
        });

        if (!publicacao) {
            throw new Error('Publicação não encontrada');
        }

        if (publicacao.comentarios.length === 0) {
            console.log('📭 Nenhum comentário para analisar');
            return null;
        }

        //  Verificar se já existe análise
        const analiseExistente = await prisma.analisesSentimento.findFirst({
            where: {
                publicacaoId,
                tipoAnalise: 'COMENTARIOS'
            }
        });

        if (analiseExistente) {
            console.log(' Análise já existe para esta publicação');
            return analiseExistente;
        }

        //  Filtrar comentários de qualidade
        const comentariosFiltrados = filtrarComentariosRelevantes(publicacao.comentarios);
        
        if (comentariosFiltrados.length === 0) {
            console.log('📭 Nenhum comentário relevante após filtragem');
            // Não salva nada, apenas retorna null
            return null;
        }

        // Preparar contexto do candidato
        const candidatoContext = {
            nome: publicacao.candidato.nome,
            instagramHandle: publicacao.candidato.instagramHandle,
            biography: publicacao.candidato.instagramBiography,
            followers: publicacao.candidato.followersCount,
            verified: publicacao.candidato.verified,
            cargoAtual: publicacao.candidato.cargo?.nome || 'Não informado',
            cargoPretendido: publicacao.candidato.cargoPretendido?.nome || 'Não informado',
            macrorregiao: publicacao.candidato.macrorregiao?.nome || 'Não informada'
        };

        // Preparar comentários para análise
        const comentariosTexto = comentariosFiltrados.map((c, index) => 
            `${index + 1}. "${c.text}" (${c.likesCount || 0} likes, @${c.ownerUsername || 'anônimo'}${c.ownerIsVerified ? ' ✓' : ''})`
        ).join('\n');

        // Criar prompt melhorado
        const prompt = criarPromptAnaliseOtimizado(candidatoContext, comentariosTexto, comentariosFiltrados.length);

        console.log(`🤖 Enviando ${comentariosFiltrados.length} comentários para análise...`);

        // Fazer chamada para Gemini com retry
        const analiseResult = await chamarGeminiComRetry(prompt);
        
        //  CALCULAR CONFIANÇA OBJETIVA (substituir a da IA)
        const confiancaCalculada = calcularConfiancaObjetiva(comentariosFiltrados, analiseResult);
        
        console.log(`📊 Score: ${analiseResult.sentimentoScore} | Confiança: IA=${analiseResult.confianca} → Calc=${confiancaCalculada.toFixed(2)}`);

        // Salvar análise no banco
        const novaAnalise = await prisma.analisesSentimento.create({
            data: {
                publicacaoId,
                candidatoId: publicacao.candidato.id,
                tipoAnalise: 'COMENTARIOS',
                sentimentoLabel: analiseResult.sentimentoLabel,
                sentimentoScore: analiseResult.sentimentoScore,
                confianca: confiancaCalculada, // ← Usar confiança calculada
                totalComentariosAnalisados: comentariosFiltrados.length,
                resumoInsights: {
                    ...analiseResult.insights,
                    //  Adicionar métricas para transparência
                    metricas: {
                        usuariosUnicos: new Set(comentariosFiltrados.map(c => c.ownerUsername)).size,
                        diversidadeUsuarios: parseFloat((new Set(comentariosFiltrados.map(c => c.ownerUsername)).size / comentariosFiltrados.length).toFixed(2)),
                        tamanhoMedioComentario: Math.round(comentariosFiltrados.reduce((acc, c) => acc + c.text.length, 0) / comentariosFiltrados.length),
                        usuariosVerificados: comentariosFiltrados.filter(c => c.ownerIsVerified).length,
                        comentariosComLikes: comentariosFiltrados.filter(c => (c.likesCount || 0) > 0).length,
                        confiancaOriginalIA: analiseResult.confianca,
                        confiancaCalculada: confiancaCalculada
                    }
                },
                geminiModel: 'gemini-2.0-flash',
                versaoPrompt: 'v2.1-confianca-objetiva'
            }
        });

        console.log(` Análise salva: ${analiseResult.sentimentoLabel} (${analiseResult.sentimentoScore}) - Confiança: ${confiancaCalculada.toFixed(2)}`);
        return novaAnalise;

    } catch (error) {
        console.error('❌ Erro na análise de sentimento:', error.message);
        if (error.message.includes('publicação')) {
            throw error;
        }
        return null;
    }
};

//  Filtrar comentários relevantes para análise
const filtrarComentariosRelevantes = (comentarios) => {
    return comentarios.filter(comentario => {
        const texto = comentario.text?.trim();
        
        if (!texto || texto.length < 3) return false;
        
        // Filtrar emojis apenas ou texto muito curto
        if (texto.length < 10 && /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(texto)) {
            return false;
        }
        
        // Filtrar spam comum
        const spamPatterns = [
            /^(kkk+|aha+|rsrs+)$/i,
            /^(top+|show+|legal+)$/i,
            /^[@#]+/,
            /^\d+$/,
            /^[^\w\sáéíóúâêîôûàèìòùäëïöüç]{3,}$/i
        ];
        
        if (spamPatterns.some(pattern => pattern.test(texto))) {
            return false;
        }
        
        return true;
    });
};

//  Salvar análise vazia quando não há comentários relevantes
const salvarAnaliseVazia = async (publicacaoId, candidatoId, motivo) => {
    return await prisma.analisesSentimento.create({
        data: {
            publicacaoId,
            candidatoId,
            tipoAnalise: 'COMENTARIOS',
            sentimentoLabel: 'NEUTRO',
            sentimentoScore: 0.0,
            confianca: 0.0,
            totalComentariosAnalisados: 0,
            resumoInsights: {
                motivo,
                palavrasChave: [],
                temas: [],
                resumo: 'Sem comentários relevantes para análise'
            },
            geminiModel: null,
            versaoPrompt: 'v2.0'
        }
    });
};

//  Chamar Gemini com retry e tratamento de erros
const chamarGeminiComRetry = async (prompt, tentativas = 3) => {
    for (let i = 0; i < tentativas; i++) {
        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            console.log(`🎯 Resposta do Gemini (tentativa ${i + 1}):`, text.substring(0, 200) + '...');

            return parseGeminiResponse(text);
            
        } catch (error) {
            console.error(`❌ Erro na tentativa ${i + 1}:`, error.message);
            
            if (i === tentativas - 1) {
                //  Última tentativa falhou - confiança muito baixa
                return {
                    sentimentoLabel: 'NEUTRO',
                    sentimentoScore: 0.0,
                    confianca: 0.05, // Confiança muito baixa por erro
                    insights: {
                        palavrasChave: [],
                        temas: ['erro_processamento'],
                        resumo: `Erro na análise após ${tentativas} tentativas`
                    }
                };
            }
            
            // Aguardar antes da próxima tentativa
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        }
    }
};

//  Prompt otimizado para análise
const criarPromptAnaliseOtimizado = (candidato, comentarios, totalComentarios) => {
    return `Analise o sentimento destes comentários sobre o candidato político brasileiro.

CANDIDATO: ${candidato.nome} (@${candidato.instagramHandle})
Cargo: ${candidato.cargoPretendido || candidato.cargoAtual}
Seguidores: ${candidato.followers?.toLocaleString() || 'N/A'}
Verificado: ${candidato.verified ? 'Sim' : 'Não'}

COMENTÁRIOS (${totalComentarios}):
${comentarios}

INSTRUÇÕES:
1. Analise o sentimento geral considerando o contexto político brasileiro
2. Considere ironia, sarcasmo e críticas construtivas vs destrutivas
3. Avalie o tom geral: apoio, crítica ou neutralidade
4. Identifique temas principais mencionados
5. Se não houver algum dado, tente analisar mesmo assim, se não fica muito vago.

CLASSIFICAÇÃO:
- POSITIVO: Apoio, elogios, concordância
- NEGATIVO: Críticas destrutivas, ataques, desaprovação
- NEUTRO: Comentários informativos, críticas construtivas, neutros

RESPONDA EM JSON VÁLIDO:
{
  "sentimentoLabel": "POSITIVO|NEGATIVO|NEUTRO",
  "sentimentoScore": 0.0,
  "confianca": 0.0,
  "insights": {
    "palavrasChave": ["palavra1", "palavra2", "palavra3"],
    "temas": ["tema1", "tema2"],
    "resumo": "Breve resumo do sentimento (máx 80 caracteres)"
  }
}

REGRAS:
- sentimentoScore: -1.0 (muito negativo) a +1.0 (muito positivo)
- confianca: 0.0 (baixa) a 1.0 (alta confiança)
- Máximo 4 palavras-chave, 3 temas
- Seja objetivo e preciso`;
};

//  Parse melhorado da resposta do Gemini
const parseGeminiResponse = (text) => {
    try {
        // Limpar resposta
        let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Tentar encontrar JSON válido se houver texto extra
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanText = jsonMatch[0];
        }
        
        const parsed = JSON.parse(cleanText);
        
        //  Validações rigorosas
        if (!['POSITIVO', 'NEGATIVO', 'NEUTRO'].includes(parsed.sentimentoLabel)) {
            console.warn('⚠️ sentimentoLabel inválido, usando NEUTRO');
            parsed.sentimentoLabel = 'NEUTRO';
        }
        
        if (typeof parsed.sentimentoScore !== 'number' || parsed.sentimentoScore < -1 || parsed.sentimentoScore > 1) {
            console.warn('⚠️ sentimentoScore inválido, usando 0.0');
            parsed.sentimentoScore = 0.0;
        }
        
        if (typeof parsed.confianca !== 'number' || parsed.confianca < 0 || parsed.confianca > 1) {
            console.warn('⚠️ confianca inválida, usando 0.5');
            parsed.confianca = 0.5;
        }
        
        //  Garantir estrutura de insights
        if (!parsed.insights || typeof parsed.insights !== 'object') {
            parsed.insights = { palavrasChave: [], temas: [], resumo: 'Análise processada' };
        }
        
        //  Limitar arrays
        if (Array.isArray(parsed.insights.palavrasChave)) {
            parsed.insights.palavrasChave = parsed.insights.palavrasChave
                .filter(palavra =>
                    palavra.length > 2 &&
                    !/^\d+$/.test(palavra) && // só números
                    !/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(palavra) && // só emojis
                    !/^[^\w\sáéíóúâêîôûàèìòùäëïöüç]+$/i.test(palavra) // só caracteres especiais
                )
                .slice(0, 4);
        } else {
            parsed.insights.palavrasChave = [];
        }

        if (Array.isArray(parsed.insights.temas)) {
            parsed.insights.temas = parsed.insights.temas
                .filter(tema =>
                    tema.length > 2 &&
                    !/^\d+$/.test(tema) &&
                    !/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(tema) &&
                    !/^[^\w\sáéíóúâêîôûàèìòùäëïöüç]+$/i.test(tema)
                )
                .slice(0, 3);
        } else {
            parsed.insights.temas = [];
        }
        
        //  Garantir resumo
        if (!parsed.insights.resumo || typeof parsed.insights.resumo !== 'string') {
            parsed.insights.resumo = `Sentimento ${parsed.sentimentoLabel.toLowerCase()} identificado`;
        }
        
        return {
            sentimentoLabel: parsed.sentimentoLabel,
            sentimentoScore: parseFloat(parsed.sentimentoScore.toFixed(2)),
            confianca: parseFloat(parsed.confianca.toFixed(2)),
            insights: parsed.insights
        };
        
    } catch (error) {
        console.error('❌ Erro ao fazer parse da resposta:', error.message);
        console.error('Resposta original:', text);
        
        //  Fallback mais robusto
        return {
            sentimentoLabel: 'NEUTRO',
            sentimentoScore: 0.0,
            confianca: 0.1,
            insights: {
                palavrasChave: [],
                temas: ['erro_processamento'],
                resumo: 'Erro no processamento - análise manual necessária'
            }
        };
    }
};

//  Buscar estatísticas otimizadas
export const obterEstatisticasSentimento = async (candidatoIds = null, cargoIds = null) => {
    try {
        const whereClause = {
            tipoAnalise: 'COMENTARIOS'
        };

        // Filtros opcionais
        if (candidatoIds?.length > 0 || cargoIds?.length > 0) {
            whereClause.candidato = {};
            
            if (candidatoIds?.length > 0) {
                whereClause.candidato.id = { in: candidatoIds };
            }
            
            if (cargoIds?.length > 0) {
                whereClause.candidato.OR = [
                    { cargoId: { in: cargoIds } },
                    { cargoPretendidoId: { in: cargoIds } }
                ];
            }
        }

        const stats = await prisma.analisesSentimento.groupBy({
            by: ['sentimentoLabel'],
            _count: { sentimentoLabel: true },
            _avg: { 
                sentimentoScore: true,
                confianca: true 
            },
            where: whereClause
        });

        const resultado = {
            positivo: 0,
            negativo: 0,
            neutro: 0,
            total: 0,
            scoreMediaPonderado: 0,
            confiancaMedia: 0
        };

        let somaScore = 0;
        let somaConfianca = 0;

        stats.forEach(stat => {
            const count = stat._count.sentimentoLabel;
            const avgScore = stat._avg.sentimentoScore || 0;
            const avgConfianca = stat._avg.confianca || 0;
            
            resultado.total += count;
            somaScore += avgScore * count;
            somaConfianca += avgConfianca * count;
            
            switch (stat.sentimentoLabel) {
                case 'POSITIVO':
                    resultado.positivo = count;
                    break;
                case 'NEGATIVO':
                    resultado.negativo = count;
                    break;
                case 'NEUTRO':
                    resultado.neutro = count;
                    break;
            }
        });

        if (resultado.total > 0) {
            resultado.scoreMediaPonderado = parseFloat((somaScore / resultado.total).toFixed(2));
            resultado.confiancaMedia = parseFloat((somaConfianca / resultado.total).toFixed(2));
        }

        return resultado;
        
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas de sentimento:', error.message);
        return { 
            positivo: 0, 
            negativo: 0, 
            neutro: 0, 
            total: 0,
            scoreMediaPonderado: 0,
            confiancaMedia: 0
        };
    }
};

//  Processamento em lote otimizado
export const processarAnalisesSentimentoPendentes = async () => {
    try {
        console.log('🔄 Buscando publicações pendentes para análise...');
        
        //  Buscar apenas publicações com comentários relevantes
        const publicacoesPendentes = await prisma.publicacoes.findMany({
            where: {
                // comentarios: {
                //     some: {
                //         text: {
                //             not: ""
                //         }
                //     }
                // },
                analisesSentimento: {
                    none: {
                        tipoAnalise: 'COMENTARIOS'
                    }
                }
            },
            include: {
                _count: {
                    select: {
                        comentarios: true
                    }
                },
                candidato: {
                    select: {
                        nome: true,
                        ativo: true
                    }
                }
            },
            orderBy: {
                comentarios: {
                    _count: 'desc'
                }
            },
            take: 20
        });

        if (publicacoesPendentes.length === 0) {
            console.log(' Nenhuma publicação pendente para análise');
            return { processadas: 0, erros: 0 };
        }

        //  Filtrar apenas candidatos ativos
        const publicacoesAtivas = publicacoesPendentes.filter(p => 
            p.candidato.ativo && p._count.comentarios >= 2 // Mínimo 2 comentários
        );

        console.log(`📊 Encontradas ${publicacoesAtivas.length} publicações para analisar`);

        let processadas = 0;
        let erros = 0;

        for (const publicacao of publicacoesAtivas) {
            try {
                console.log(`🧠 Analisando publicação com ${publicacao._count.comentarios} comentários (${publicacao.candidato.nome})`);
                
                await analisarSentimentoComentarios(publicacao.id);
                processadas++;
                
                //  Delay escalonado baseado no número de comentários
                const delay = Math.min(2000 + (publicacao._count.comentarios * 10), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
            } catch (error) {
                console.error(`❌ Erro ao processar publicação ${publicacao.id}:`, error.message);
                erros++;
                
                // Se muitos erros seguidos, parar para evitar rate limit
                if (erros >= 3 && processadas === 0) {
                    console.log('⚠️ Muitos erros consecutivos, parando processamento');
                    break;
                }
            }
        }

        console.log(` Processamento de sentimento concluído: ${processadas} sucessos, ${erros} erros`);
        return { processadas, erros };

    } catch (error) {
        console.error('❌ Erro no processamento batch de sentimento:', error.message);
        return { processadas: 0, erros: 1 };
    }
};
