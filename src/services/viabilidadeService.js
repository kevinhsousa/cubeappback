// services/viabilidadeService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 1,
        maxOutputTokens: 1500,
    }
});

// 🎯 BANCO DE CONHECIMENTO I_ref para Score Cube (conforme documento)
const BANCO_CONHECIMENTO = {
    "Federal": { "I_ref": 1476.58, "atualizado_em": "2025-07-22" },
    "Estadual": { "I_ref": 587.88, "atualizado_em": "2025-07-22" }
};

/**
 * 🎯 ANÁLISE DE VIABILIDADE PRINCIPAL
 */
export const analisarViabilidadeCandidato = async (candidatoId) => {
    try {
        console.log(`🎯 Iniciando análise de viabilidade para candidato: ${candidatoId}`);

        const candidato = await buscarDadosCompletosCandidato(candidatoId);
        
        if (!candidato) {
            throw new Error('Candidato não encontrado');
        }

        // Verificar se já existe análise recente (menos de 24h)
        const analiseRecente = await prisma.analiseViabilidade.findFirst({
            where: {
                candidatoId,
                processadoEm: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }
        });

        if (analiseRecente) {
            console.log('✅ Análise de viabilidade recente já existe');
            return analiseRecente;
        }

        // ✅ DETERMINAR MÉTODO DE ANÁLISE baseado no cargo pretendido
        const cargoPretendido = candidato.cargoPretendido?.nome?.toLowerCase() || '';
        const isScoreCube = cargoPretendido.includes('federal') || cargoPretendido.includes('estadual');
        
        console.log(`📊 Método: ${isScoreCube ? 'Score Cube' : 'IA Qualitativa'} para cargo: ${candidato.cargoPretendido?.nome || 'N/A'}`);

        let resultadoAnalise;

        if (isScoreCube) {
            // ✅ SCORE CUBE para Federal/Estadual
            const validacao = validarDadosParaScoreCube(candidato);
            if (!validacao.valido) {
                console.log(`⚠️ Dados insuficientes para Score Cube: ${validacao.motivo}`);
                // Não salva nada, apenas retorna null
                return null;
            }
            
            resultadoAnalise = await executarScoreCube(candidato);
            if (!resultadoAnalise) {
                // Em caso de erro na IA, não salva nada
                return null;
            }
            
        } else {
            // ✅ ANÁLISE IA para Municipal/Distrital/outros
            const validacao = validarDadosParaAnaliseIA(candidato);
            if (!validacao.valido) {
                console.log(`⚠️ Dados insuficientes para análise IA: ${validacao.motivo}`);
                // Não salva nada, apenas retorna null
                return null;
            }
            
            resultadoAnalise = await executarAnaliseIA(candidato);
            if (!resultadoAnalise) {
                // Em caso de erro na IA, não salva nada
                return null;
            }
        }

        // Salvar análise no banco
        const novaAnalise = await prisma.analiseViabilidade.create({
            data: {
                candidatoId,
                scoreViabilidade: resultadoAnalise.score,
                categoria: resultadoAnalise.categoria,
                confianca: resultadoAnalise.confianca,
                dadosQuantitativos: resultadoAnalise.dadosUsados || resultadoAnalise.dadosQuantitativos,
                resumoSentimento: resultadoAnalise.resumoSentimento || {},
                justificativa: resultadoAnalise.justificativa,
                pontosFortes: resultadoAnalise.pontosFortes,
                pontosAtencao: resultadoAnalise.pontosAtencao,
                geminiModel: isScoreCube ? 'score-cube-v2.0' : 'gemini-1.5-flash',
                versaoPrompt: isScoreCube ? 'v2.0-score-cube' : 'v2.0-ia-qualitativa'
            }
        });

        // Atualizar campo pontuacaoViabilidade no candidato
        await prisma.candidato.update({
            where: { id: candidatoId },
            data: { pontuacaoViabilidade: resultadoAnalise.score }
        });

        console.log(`✅ Viabilidade analisada: ${resultadoAnalise.categoria} (${resultadoAnalise.score}%)`);
        console.log(`📊 Método: ${isScoreCube ? 'Score Cube' : 'IA Qualitativa'} | Confiança: ${resultadoAnalise.confianca}`);
        
        return novaAnalise;

    } catch (error) {
        console.error('❌ Erro na análise de viabilidade:', error.message);
        // Não salva nada, apenas retorna null
        return null;
    }
};

/**
 * 🎯 EXECUTAR SCORE CUBE (Federal/Estadual) - Implementação exata do documento
 */
const executarScoreCube = async (candidato) => {
    try {
        console.log(`🎯 Executando Score Cube para ${candidato.nome}`);

        // 1. Definir nível baseado no cargo pretendido
        const cargoPretendido = candidato.cargoPretendido?.nome?.toLowerCase() || '';
        const nivel = cargoPretendido.includes('federal') ? 'Federal' : 'Estadual';

        // 2. Obter I_ref do banco de conhecimento
        const I_ref = BANCO_CONHECIMENTO[nivel].I_ref;

        // 3. Classificar candidato: Veterano (tem votos) ou Estreante (sem votos)
        const VOTOS_CANDIDATO = candidato.votosUltimaEleicao || 0;
        const tipoCanditato = VOTOS_CANDIDATO > 0 ? 'VETERANO' : 'ESTREANTE';

        // 4. Calcular votos necessários se não informado
        let VOTOS_NECESSARIOS = candidato.votosNecessarios || 0;
        if (VOTOS_NECESSARIOS === 0) {
            // Calcular baseado na população ou estimativa
            if (candidato.populacaoCidade > 0) {
                // Para municipal: ~30% da população vota, precisa de 50%+1
                const estimativaEleitores = Math.floor(candidato.populacaoCidade * 0.7); // 70% são eleitores
                const estimativaComparecimento = Math.floor(estimativaEleitores * 0.8); // 80% comparecem
                VOTOS_NECESSARIOS = Math.floor(estimativaComparecimento * 0.5) + 1;
            } else if (nivel === 'Federal') {
                VOTOS_NECESSARIOS = 120000; // Estimativa média para Deputado Federal
            } else if (nivel === 'Estadual') {
                VOTOS_NECESSARIOS = 45000; // Estimativa média para Deputado Estadual
            }
        }

        // 5. Calcular Taxa de Engajamento (TE)
        const seguidores = candidato.followersCount || 0;
        const engajamentoMedio = calcularEngajamentoMedio(candidato);
        const TE = seguidores > 0 ? (engajamentoMedio / seguidores) * 100 : 0;

        // 6. Calcular razões (máximo = 1) conforme documento
        const R_E = Math.min(TE / 1, 1); // TE dividido por 1%

        let razaoEspecifica = 0;
        let scoreCalculation = '';

        if (tipoCanditato === 'VETERANO') {
            // R_V = VOTOS_CANDIDATO ÷ VOTOS_NECESSARIOS
            const R_V = VOTOS_NECESSARIOS > 0 ? 
                       Math.min(VOTOS_CANDIDATO / VOTOS_NECESSARIOS, 1) : 0;
            razaoEspecifica = R_V;
            scoreCalculation = `VETERANO: (0.5 × ${R_V.toFixed(3)} + 0.5 × ${R_E.toFixed(3)}) × 100`;
        } else {
            // R_I = INT_MEDIAS ÷ I_ref
            const R_I = Math.min(engajamentoMedio / I_ref, 1);
            razaoEspecifica = R_I;
            scoreCalculation = `ESTREANTE: (0.5 × ${R_I.toFixed(3)} + 0.5 × ${R_E.toFixed(3)}) × 100`;
        }

        // 7. Calcular Score Cube final (conforme documento)
        const scoreFinal = Math.round((0.5 * razaoEspecifica + 0.5 * R_E) * 100);

        // 8. Determinar categoria baseada no score (conforme documento)
        let categoria = '';
        let mensagemChave = '';
        
        if (scoreFinal >= 75) {
            categoria = 'ALTA';
            mensagemChave = 'Alta chance de vitória';
        } else if (scoreFinal >= 50) {
            categoria = 'MEDIA';
            mensagemChave = 'Chances moderadas; precisa garantir tração';
        } else if (scoreFinal >= 25) {
            categoria = 'RISCO';
            mensagemChave = 'Risco elevado; cenário incerto';
        } else {
            categoria = 'CRITICO';
            mensagemChave = 'Probabilidade remota de eleição';
        }

        // 9. Calcular confiança baseada na disponibilidade de dados
        let confianca = 0.3; // Base
        if (VOTOS_CANDIDATO > 0) confianca += 0.25; // Tem histórico eleitoral
        if (VOTOS_NECESSARIOS > 0) confianca += 0.2; // Tem meta definida
        if (seguidores > 1000) confianca += 0.15; // Boa presença digital
        if (candidato.publicacoes && candidato.publicacoes.length >= 10) confianca += 0.1; // Ativo no Instagram
        confianca = Math.min(confianca, 1.0);

        // 10. Obter insights qualitativos da IA para complementar
        const contextoIA = await criarContextoParaIA(candidato);
        const insightsIA = await obterInsightsQualitativos(candidato, contextoIA, {
            score: scoreFinal,
            categoria,
            tipo: tipoCanditato
        });

        const resultado = {
            score: scoreFinal,
            categoria,
            tipo: tipoCanditato,
            confianca: parseFloat(confianca.toFixed(2)),
            justificativa: `${mensagemChave}. Score Cube: ${scoreFinal}% (${tipoCanditato})`,
            pontosFortes: insightsIA.pontosFortes,
            pontosAtencao: insightsIA.pontosAtencao,
            dadosUsados: {
                metodo: 'Score Cube v2.0',
                nivel,
                I_ref,
                tipoCanditato,
                seguidores,
                engajamentoMedio: Math.round(engajamentoMedio),
                TE: parseFloat(TE.toFixed(3)),
                R_E: parseFloat(R_E.toFixed(3)),
                razaoEspecifica: parseFloat(razaoEspecifica.toFixed(3)),
                scoreCalculation,
                VOTOS_CANDIDATO,
                VOTOS_NECESSARIOS,
                mensagemChave,
                calculadoEm: new Date().toISOString()
            },
            resumoSentimento: contextoIA.resumoSentimento
        };

        console.log(`✅ Score Cube calculado: ${scoreFinal}% (${categoria}) - ${tipoCanditato}`);
        return resultado;

    } catch (error) {
        console.error('❌ Erro no Score Cube:', error.message);
        // Não salva nada, apenas retorna null
        return null;
    }
};

const executarAnaliseIA = async (candidato) => {
    try {
        console.log(`🤖 Executando análise IA para ${candidato.nome}`);

        const dadosQuantitativos = extrairDadosQuantitativos(candidato);
        const resumoSentimento = await obterResumoSentimento(candidato.id);
        const prompt = criarPromptAnaliseIA(candidato, dadosQuantitativos, resumoSentimento);

        console.log(`🤖 Enviando análise IA para Gemini...`);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const analiseResult = parseGeminiViabilidade(text);

        return {
            score: analiseResult.scoreViabilidade,
            categoria: analiseResult.categoria,
            confianca: analiseResult.confianca,
            justificativa: analiseResult.justificativa,
            pontosFortes: analiseResult.pontosFortes,
            pontosAtencao: analiseResult.pontosAtencao,
            dadosQuantitativos,
            resumoSentimento
        };

    } catch (error) {
        console.error('❌ Erro na análise IA:', error.message);
        // Não salva nada, apenas retorna null
        return null;
    }
};

/**
 * 🎯 ANÁLISE DE VIABILIDADE PARA CANDIDATOS EM LOTE
 */
export const analisarViabilidadeCandidatos = async (candidatoIds) => {
    try {
        console.log(`🔄 Iniciando análise em lote para ${candidatoIds.length} candidatos`);

        const resultados = [];

        for (const candidatoId of candidatoIds) {
            const resultado = await analisarViabilidadeCandidato(candidatoId);
            resultados.push(resultado);
            
            // Delay para não sobrecarregar o sistema
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`✅ Análise em lote concluída`);
        return resultados;

    } catch (error) {
        console.error('❌ Erro na análise em lote:', error.message);
        return null;
    }
};

/**
 * 🎯 EXECUTAR ANÁLISE AGENDADA (ex: diariamente)
 */
export const executarAnaliseAgendada = async () => {
    try {
        console.log('🕒 Executando análise de viabilidade agendada...');

        // Buscar candidatos sem análise ou análise antiga (>24h)
        const candidatosPendentes = await prisma.candidato.findMany({
            where: {
                ativo: true,
                instagramHandle: { not: null },
                followersCount: { gt: 0 },
                // Não tem análise OU análise é antiga
                OR: [
                    { viabilidades: { none: {} } },
                    {
                        viabilidades: {
                            every: {
                                processadoEm: {
                                    lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
                                }
                            }
                        }
                    }
                ]
            },
            include: {
                cargoPretendido: { select: { nome: true } }
            }
        });

        if (candidatosPendentes.length === 0) {
            console.log('✅ Nenhum candidato pendente para análise');
            return;
        }

        console.log(`📊 Encontrados ${candidatosPendentes.length} candidatos para processar`);

        for (const candidato of candidatosPendentes) {
            try {
                console.log(`🔄 Processando: ${candidato.nome} (${candidato.cargoPretendido?.nome})`);
                
                await analisarViabilidadeCandidato(candidato.id);
                
                // Delay para não sobrecarregar o sistema
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ Erro ao processar ${candidato.nome}:`, error.message);
            }
        }

        console.log(`✅ Análise agendada concluída`);

    } catch (error) {
        console.error('❌ Erro na execução da análise agendada:', error.message);
    }
};

/**
 * ✅ Validações de dados
 */
const validarDadosParaScoreCube = (candidato) => {
    const problemas = [];

    if (!candidato.cargoPretendido?.nome) {
        problemas.push('Cargo pretendido não definido');
    }

    if (!candidato.followersCount || candidato.followersCount === 0) {
        problemas.push('Sem dados de seguidores do Instagram');
    }

    if (!candidato.publicacoes || candidato.publicacoes.length === 0) {
        problemas.push('Sem publicações no Instagram para calcular engajamento');
    }

    // Para Score Cube, não é obrigatório ter votosNecessarios - podemos calcular
    
    return {
        valido: problemas.length === 0,
        motivo: problemas.join('; ') || 'Dados suficientes para Score Cube'
    };
};

const validarDadosParaAnaliseIA = (candidato) => {
    const problemas = [];

    if (!candidato.cargoPretendido?.nome) {
        problemas.push('Cargo pretendido não definido');
    }

    if (!candidato.followersCount || candidato.followersCount === 0) {
        problemas.push('Sem dados de seguidores do Instagram');
    }

    return {
        valido: problemas.length === 0,
        motivo: problemas.join('; ') || 'Dados suficientes para análise IA'
    };
};

/**
 * 📊 Calcular engajamento médio das publicações
 */
const calcularEngajamentoMedio = (candidato) => {
    if (!candidato.publicacoes || candidato.publicacoes.length === 0) {
        return 0;
    }

    const publicacoesValidas = candidato.publicacoes.filter(p => 
        p.likesCount !== null && p.commentsCount !== null &&
        p.likesCount >= 0 && p.commentsCount >= 0
    );

    if (publicacoesValidas.length === 0) {
        return 0;
    }

    const totalEngajamento = publicacoesValidas.reduce((acc, p) => 
        acc + (p.likesCount || 0) + (p.commentsCount || 0), 0
    );

    return totalEngajamento / publicacoesValidas.length;
};

/**
 * 📈 Extrair dados quantitativos do candidato
 */
const extrairDadosQuantitativos = (candidato) => {
    const ultimoHistorico = candidato.historicoSeguidores?.[0];
    
    const publicacoesComDados = candidato.publicacoes?.filter(p => 
        p.likesCount !== null && p.commentsCount !== null
    ) || [];
    
    const engajamentoMedio = publicacoesComDados.length > 0 
        ? publicacoesComDados.reduce((acc, p) => acc + (p.likesCount || 0) + (p.commentsCount || 0), 0) / publicacoesComDados.length
        : 0;
    
    const taxaEngajamento = candidato.followersCount > 0 
        ? (engajamentoMedio / candidato.followersCount) * 100 
        : 0;
    
    const crescimentoSeguidores = ultimoHistorico?.variacaoSeguidores || 0;
    const crescimentoPercentual = ultimoHistorico?.percentualVariacao || 0;
    
    const isNivelMunicipal = candidato.cargo?.nivel === 'MUNICIPAL' || 
                            candidato.cargoPretendido?.nivel === 'MUNICIPAL' ||
                            candidato.cargoPretendido?.nome?.toLowerCase().includes('prefeito') ||
                            candidato.cargoPretendido?.nome?.toLowerCase().includes('vereador');
    
    let dadosMunicipais = {};
    if (isNivelMunicipal) {
        const percentualVotosUltimaEleicao = candidato.votosValidos > 0 && candidato.votosUltimaEleicao > 0
            ? (candidato.votosUltimaEleicao / candidato.votosValidos) * 100
            : 0;
        
        const penetracaoDigital = candidato.populacaoCidade > 0 && candidato.followersCount > 0
            ? (candidato.followersCount / candidato.populacaoCidade) * 100
            : 0;
        
        let votosParaVitoria = candidato.votosNecessarios || 0;
        if (votosParaVitoria === 0 && candidato.votosValidos > 0) {
            votosParaVitoria = Math.floor((candidato.votosValidos * 0.5) + 1);
        }
        
        const distanciaVitoria = votosParaVitoria > 0 && candidato.votosUltimaEleicao > 0
            ? votosParaVitoria - candidato.votosUltimaEleicao
            : 0;

        dadosMunicipais = {
            populacaoCidade: candidato.populacaoCidade || 0,
            votosValidos: candidato.votosValidos || 0,
            votosUltimaEleicao: candidato.votosUltimaEleicao || 0,
            percentualVotosUltimaEleicao: parseFloat(percentualVotosUltimaEleicao.toFixed(2)),
            penetracaoDigital: parseFloat(penetracaoDigital.toFixed(3)),
            votosParaVitoria,
            distanciaVitoria
        };
    }

    return {
        seguidores: candidato.followersCount || 0,
        seguindo: candidato.followsCount || 0,
        verificado: candidato.verified || false,
        totalPublicacoes: candidato.postsCount || 0,
        publicacoesRecentes: candidato.publicacoes?.length || 0,
        engajamentoMedio: Math.round(engajamentoMedio),
        taxaEngajamento: parseFloat(taxaEngajamento.toFixed(3)),
        crescimentoSeguidores,
        crescimentoPercentual: parseFloat(crescimentoPercentual?.toFixed(2) || 0),
        cargoAtual: candidato.cargo?.nome || 'Não informado',
        cargoPretendido: candidato.cargoPretendido?.nome || 'Não informado',
        nivelCargo: candidato.cargo?.nivel || candidato.cargoPretendido?.nivel,
        macrorregiao: candidato.macrorregiao?.nome || 'Não informada',
        isNivelMunicipal,
        ...dadosMunicipais
    };
};

/**
 * 💾 Salvar análise incompleta quando dados são insuficientes
 */
const salvarAnaliseIncompleta = async (candidatoId, motivo, metodo) => {
    return await prisma.analiseViabilidade.create({
        data: {
            candidatoId,
            scoreViabilidade: 0.0,
            categoria: 'CRITICO',
            confianca: 0.0,
            dadosQuantitativos: { erro: 'Dados insuficientes', metodo },
            resumoSentimento: {},
            justificativa: `Análise não realizada: ${motivo}`,
            pontosFortes: [],
            pontosAtencao: [motivo],
            geminiModel: null,
            versaoPrompt: `v2.0-dados-insuficientes-${metodo.toLowerCase()}`
        }
    });
};

/**
 * 🔍 Buscar dados completos do candidato
 */
const buscarDadosCompletosCandidato = async (candidatoId) => {
    return await prisma.candidato.findUnique({
        where: { id: candidatoId },
        include: {
            cargo: { select: { nome: true, nivel: true } },
            cargoPretendido: { select: { nome: true, nivel: true } },
            macrorregiao: { select: { nome: true } },
            historicoSeguidores: {
                orderBy: { dataColeta: 'desc' },
                take: 5
            },
            publicacoes: {
                select: {
                    likesCount: true,
                    commentsCount: true,
                    timestamp: true
                },
                where: {
                    likesCount: { not: null },
                    commentsCount: { not: null }
                },
                orderBy: { timestamp: 'desc' },
                take: 20
            }
        }
    });
};

/**
 * 🧠 Criar contexto para IA complementar
 */
const criarContextoParaIA = async (candidato) => {
    const resumoSentimento = await obterResumoSentimento(candidato.id);
    
    return {
        nome: candidato.nome,
        instagramHandle: candidato.instagramHandle,
        seguidores: candidato.followersCount,
        cargo: candidato.cargoPretendido?.nome,
        macrorregiao: candidato.macrorregiao?.nome,
        resumoSentimento
    };
};

/**
 * 💡 Obter insights qualitativos da IA para complementar Score Cube
 */
const obterInsightsQualitativos = async (candidato, contexto, scoreCube) => {
    try {
        const prompt = `Analista político: Com base no Score Cube calculado, forneça insights qualitativos complementares.

CANDIDATO: ${contexto.nome}
SCORE CUBE: ${scoreCube.score}% (${scoreCube.categoria})
TIPO: ${scoreCube.tipo}
CARGO: ${contexto.cargo}
SEGUIDORES: ${contexto.seguidores?.toLocaleString()}

Forneça insights para complementar a análise quantitativa.

JSON:
{
  "pontosFortes": ["ponto1", "ponto2"],
  "pontosAtencao": ["atenção1", "atenção2"]
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        return parseInsightsIA(text);
        
    } catch (error) {
        return {
            pontosFortes: scoreCube.tipo === 'VETERANO' ? ['Experiência eleitoral'] : ['Candidato renovação'],
            pontosAtencao: ['Análise manual recomendada']
        };
    }
};

/**
 * 📝 Parse dos insights da IA
 */
const parseInsightsIA = (text) => {
    try {
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleanText);
        
        return {
            pontosFortes: Array.isArray(parsed.pontosFortes) ? parsed.pontosFortes.slice(0, 4) : ['Dados quantitativos disponíveis'],
            pontosAtencao: Array.isArray(parsed.pontosAtencao) ? parsed.pontosAtencao.slice(0, 4) : ['Revisar insights qualitativos']
        };
    } catch (error) {
        return {
            pontosFortes: ['Análise baseada em Score Cube'],
            pontosAtencao: ['Revisar insights qualitativos']
        };
    }
};

/**
 * 📝 Criar prompt para análise IA (Municipal/outros)
 */
const criarPromptAnaliseIA = (candidato, dadosQuantitativos, resumoSentimento) => {
    return `Analista político brasileiro: avalie a viabilidade eleitoral considerando o contexto político atual.

CANDIDATO: ${candidato.nome} (@${candidato.instagramHandle})
CARGO: ${dadosQuantitativos.cargoPretendido}
SEGUIDORES: ${dadosQuantitativos.seguidores.toLocaleString()}
ENGAJAMENTO: ${dadosQuantitativos.taxaEngajamento}%

${dadosQuantitativos.isNivelMunicipal && dadosQuantitativos.populacaoCidade ? `
DADOS MUNICIPAIS:
- População: ${dadosQuantitativos.populacaoCidade?.toLocaleString()}
- Penetração Digital: ${dadosQuantitativos.penetracaoDigital}%
- Votos Última Eleição: ${dadosQuantitativos.votosUltimaEleicao?.toLocaleString() || 'N/A'}
- Distância para Vitória: ${dadosQuantitativos.distanciaVitoria?.toLocaleString() || 'N/A'} votos
` : ''}

SENTIMENTO: ${resumoSentimento.totalAnalises} análises
Positivo: ${resumoSentimento.distribuicao?.positivo || 0} | Negativo: ${resumoSentimento.distribuicao?.negativo || 0} | Neutro: ${resumoSentimento.distribuicao?.neutro || 0}

Avalie considerando cenário político brasileiro 2024-2026.

JSON:
{
 "scoreViabilidade": 0.0,
 "categoria": "ALTA|MEDIA|RISCO|CRITICO", 
 "confianca": 0.0,
 "justificativa": "Explicação até 200 chars",
 "pontosFortes": ["ponto1", "ponto2"],
 "pontosAtencao": ["risco1", "risco2"]
}

REGRAS:
- score: 0-100 (ALTA: 75-100, MEDIA: 50-74, RISCO: 25-49, CRITICO: 0-24)
- confianca: 0.0-1.0
- máximo 4 pontos cada, 50 chars por ponto`;
};

/**
 * 😊 Obter resumo de sentimento do candidato
 */
const obterResumoSentimento = async (candidatoId) => {
    try {
        const analises = await prisma.analisesSentimento.findMany({
            where: { candidatoId },
            orderBy: { processadoEm: 'desc' },
            take: 20,
            select: {
                sentimentoLabel: true,
                sentimentoScore: true,
                confianca: true
            }
        });

        if (analises.length === 0) {
            return { totalAnalises: 0, scoreMedio: 0, distribuicao: { positivo: 0, negativo: 0, neutro: 0 } };
        }

        const distribuicao = {
            positivo: analises.filter(a => a.sentimentoLabel === 'POSITIVO').length,
            negativo: analises.filter(a => a.sentimentoLabel === 'NEGATIVO').length,
            neutro: analises.filter(a => a.sentimentoLabel === 'NEUTRO').length
        };

        const scoreMedio = analises.reduce((acc, a) => acc + a.sentimentoScore, 0) / analises.length;

        return {
            totalAnalises: analises.length,
            distribuicao,
            scoreMedio: parseFloat(scoreMedio.toFixed(2))
        };

    } catch (error) {
        return { totalAnalises: 0, scoreMedio: 0, distribuicao: { positivo: 0, negativo: 0, neutro: 0 } };
    }
};

/**
 * 🔍 Parse e validação da resposta do Gemini para análise IA
 */
const parseGeminiViabilidade = (text) => {
    try {
        const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleanText);
        
        // Validar e corrigir score
        if (typeof parsed.scoreViabilidade !== 'number' || parsed.scoreViabilidade < 0 || parsed.scoreViabilidade > 100) {
            parsed.scoreViabilidade = 50.0;
        }
        
        // Validar categoria
        if (!['ALTA', 'MEDIA', 'RISCO', 'CRITICO'].includes(parsed.categoria)) {
            // Determinar categoria baseada no score
            if (parsed.scoreViabilidade >= 75) parsed.categoria = 'ALTA';
            else if (parsed.scoreViabilidade >= 50) parsed.categoria = 'MEDIA';
            else if (parsed.scoreViabilidade >= 25) parsed.categoria = 'RISCO';
            else parsed.categoria = 'CRITICO';
        }
        
        // Validar confiança
        if (typeof parsed.confianca !== 'number' || parsed.confianca < 0 || parsed.confianca > 1) {
            parsed.confianca = 0.5;
        }
        
        return {
            scoreViabilidade: parseFloat(parsed.scoreViabilidade.toFixed(1)),
            categoria: parsed.categoria,
            confianca: parseFloat(parsed.confianca.toFixed(2)),
            justificativa: parsed.justificativa || 'Análise processada via IA',
            pontosFortes: Array.isArray(parsed.pontosFortes) ? parsed.pontosFortes.slice(0, 4) : ['Presença digital ativa'],
            pontosAtencao: Array.isArray(parsed.pontosAtencao) ? parsed.pontosAtencao.slice(0, 4) : ['Monitorar evolução']
        };
        
    } catch (error) {
        console.error('❌ Erro ao parse resposta Gemini:', error.message);
        return {
            scoreViabilidade: 50.0,
            categoria: 'MEDIA',
            confianca: 0.1,
            justificativa: 'Erro no processamento - análise manual necessária',
            pontosFortes: ['Requer avaliação manual'],
            pontosAtencao: ['Erro no processamento IA']
        };
    }
};

/**
 * 📊 ESTATÍSTICAS DE VIABILIDADE - CORRIGIDA
 */
export const obterEstatisticasViabilidade = async (candidatoIds = null, cargoIds = null) => {
    try {
        // Filtros para candidatos
        const candidatoFilter = { ativo: true };
        if (candidatoIds?.length > 0) {
            candidatoFilter.id = { in: candidatoIds };
        }
        if (cargoIds?.length > 0) {
            candidatoFilter.OR = [
                { cargoId: { in: cargoIds } },
                { cargoPretendidoId: { in: cargoIds } }
            ];
        }

        // Buscar candidatos com análises de viabilidade
        const candidatos = await prisma.candidato.findMany({
            where: {
                ...candidatoFilter,
                viabilidades: { some: {} } // Tem pelo menos uma análise
            },
            include: {
                cargoPretendido: { select: { nome: true, nivel: true } },
                viabilidades: {
                    orderBy: { processadoEm: 'desc' },
                    take: 1 // Apenas a mais recente
                }
            }
        });

        const distribuicao = { ALTA: 0, MEDIA: 0, RISCO: 0, CRITICO: 0 };
        const candidatosComScore = [];
        const metodoCount = { scoreCube: 0, iaQualitativa: 0 };

        candidatos.forEach(candidato => {
            const ultimaAnalise = candidato.viabilidades[0];
            
            if (ultimaAnalise) {
                // Contabilizar distribuição
                const categoria = ultimaAnalise.categoria;
                if (distribuicao.hasOwnProperty(categoria)) {
                    distribuicao[categoria]++;
                }
                
                // Identificar método usado
                const metodo = ultimaAnalise.geminiModel === 'score-cube-v2.0' ? 'scoreCube' : 'iaQualitativa';
                metodoCount[metodo]++;
                
                candidatosComScore.push({
                    id: candidato.id,
                    nome: candidato.nome,
                    cargoPretendido: candidato.cargoPretendido?.nome,
                    score: ultimaAnalise.scoreViabilidade,
                    categoria: ultimaAnalise.categoria,
                    metodo: metodo === 'scoreCube' ? 'Score Cube' : 'IA Qualitativa',
                    confianca: ultimaAnalise.confianca,
                    processadoEm: ultimaAnalise.processadoEm
                });
            }
        });

        const totalProcessados = Object.values(distribuicao).reduce((a, b) => a + b, 0);
        const totalGeral = await prisma.candidato.count({ where: candidatoFilter });

        return {
            total: totalGeral,
            totalProcessados,
            pendentes: totalGeral - totalProcessados,
            distribuicao,
            candidatos: candidatosComScore.sort((a, b) => b.score - a.score),
            metodos: {
                scoreCube: {
                    versao: '2.0',
                    escopo: 'Federal/Estadual',
                    processados: metodoCount.scoreCube,
                    bancoConhecimento: BANCO_CONHECIMENTO
                },
                iaQualitativa: {
                    versao: '2.0',
                    escopo: 'Municipal/Distrital/outros',
                    processados: metodoCount.iaQualitativa,
                    modelo: 'gemini-1.5-flash'
                }
            },
            ultimaAtualizacao: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas de viabilidade:', error.message);
        return {
            total: 0,
            totalProcessados: 0,
            pendentes: 0,
            distribuicao: { ALTA: 0, MEDIA: 0, RISCO: 0, CRITICO: 0 },
            candidatos: [],
            metodos: {
                scoreCube: { versao: '2.0', processados: 0 },
                iaQualitativa: { versao: '2.0', processados: 0 }
            }
        };
    }
};

/**
 * 🔄 PROCESSAMENTO EM LOTE - CORRIGIDO
 */
export const processarViabilidadesPendentes = async () => {
    try {
        console.log('🔄 Buscando candidatos pendentes para análise de viabilidade...');
        
        // Buscar candidatos Federal/Estadual para Score Cube
        const candidatosScoreCube = await prisma.candidato.findMany({
            where: {
                ativo: true,
                instagramHandle: { not: null },
                followersCount: { gt: 0 }, // Tem seguidores
                cargoPretendido: {
                    OR: [
                        { nome: { contains: 'Federal', mode: 'insensitive' } },
                        { nome: { contains: 'Estadual', mode: 'insensitive' } },
                        { nome: { contains: 'Deputado Federal', mode: 'insensitive' } },
                        { nome: { contains: 'Deputado Estadual', mode: 'insensitive' } },
                        { nome: { contains: 'Senador', mode: 'insensitive' } }
                    ]
                },
                // Não tem análise OU análise é antiga (>24h)
                OR: [
                    { viabilidades: { none: {} } },
                    {
                        viabilidades: {
                            every: {
                                processadoEm: {
                                    lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
                                }
                            }
                        }
                    }
                ]
            },
            include: { 
                cargoPretendido: { select: { nome: true } },
                publicacoes: { 
                    select: { id: true }, 
                    take: 1 
                }
            },
            take: 3 // Processar poucos por vez para Score Cube
        });

        // Buscar outros candidatos para Análise IA
        const candidatosIA = await prisma.candidato.findMany({
            where: {
                ativo: true,
                instagramHandle: { not: null },
                followersCount: { gt: 0 }, // Tem seguidores
                cargoPretendido: {
                    NOT: {
                        OR: [
                            { nome: { contains: 'Federal', mode: 'insensitive' } },
                            { nome: { contains: 'Estadual', mode: 'insensitive' } },
                            { nome: { contains: 'Deputado Federal', mode: 'insensitive' } },
                            { nome: { contains: 'Deputado Estadual', mode: 'insensitive' } },
                            { nome: { contains: 'Senador', mode: 'insensitive' } }
                        ]
                    }
                },
                // Não tem análise OU análise é antiga (>24h)
                OR: [
                    { viabilidades: { none: {} } },
                    {
                        viabilidades: {
                            every: {
                                processadoEm: {
                                    lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
                                }
                            }
                        }
                    }
                ]
            },
            include: { 
                cargoPretendido: { select: { nome: true } }
            },
            take: 2 // Processar poucos por vez para IA
        });

        const todosCandidatos = [
            ...candidatosScoreCube.map(c => ({ ...c, metodo: 'SCORE_CUBE' })),
            ...candidatosIA.map(c => ({ ...c, metodo: 'IA_QUALITATIVA' }))
        ];

        if (todosCandidatos.length === 0) {
            console.log('✅ Nenhum candidato pendente para análise de viabilidade');
            return { processadas: 0, erros: 0 };
        }

        console.log(`📊 Encontrados ${todosCandidatos.length} candidatos para processar:`);
        console.log(`   🎯 Score Cube (Federal/Estadual): ${candidatosScoreCube.length}`);
        console.log(`   🤖 IA Qualitativa (outros): ${candidatosIA.length}`);

        let processadas = 0;
        let erros = 0;

        for (const candidato of todosCandidatos) {
            try {
                const metodo = candidato.metodo === 'SCORE_CUBE' ? '🎯 Score Cube' : '🤖 IA Qualitativa';
                console.log(`${metodo} - Processando: ${candidato.nome} (${candidato.cargoPretendido?.nome})`);
                
                await analisarViabilidadeCandidato(candidato.id);
                processadas++;
                
                // Delay diferenciado por método
                const delay = candidato.metodo === 'SCORE_CUBE' ? 2000 : 4000; // Score Cube mais rápido
                await new Promise(resolve => setTimeout(resolve, delay));
                
            } catch (error) {
                console.error(`❌ Erro ao processar ${candidato.nome}:`, error.message);
                erros++;
                
                // Delay menor em caso de erro
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`✅ Processamento concluído: ${processadas} sucessos, ${erros} erros`);
        
        if (processadas > 0) {
            console.log(`📊 Score Cube v2.0: Implementação conforme documento oficial`);
            console.log(`🤖 IA Qualitativa: Para cargos municipais e distritais`);
        }
        
        return { processadas, erros };

    } catch (error) {
        console.error('❌ Erro no processamento batch:', error.message);
        return { processadas: 0, erros: 1 };
    }
};

/**
 * 🎯 OBTER ANÁLISE MAIS RECENTE DE UM CANDIDATO
 */
export const obterAnaliseViabilidade = async (candidatoId) => {
    try {
        const analise = await prisma.analiseViabilidade.findFirst({
            where: { candidatoId },
            orderBy: { processadoEm: 'desc' },
            include: {
                candidato: {
                    select: {
                        nome: true,
                        instagramHandle: true,
                        cargoPretendido: { select: { nome: true, nivel: true } }
                    }
                }
            }
        });

        if (!analise) {
            return null;
        }

        return {
            ...analise,
            metodoUsado: analise.geminiModel === 'score-cube-v2.0' ? 'Score Cube v2.0' : 'IA Qualitativa v2.0',
            tempoDecorrido: Math.floor((Date.now() - analise.processadoEm.getTime()) / (1000 * 60 * 60)) // horas
        };

    } catch (error) {
        console.error('❌ Erro ao obter análise de viabilidade:', error.message);
        return null;
    }
};

/**
 * 🧹 LIMPAR ANÁLISES ANTIGAS (opcional)
 */
export const limparAnalisesAntigas = async (diasParaManter = 30) => {
    try {
        const dataLimite = new Date(Date.now() - diasParaManter * 24 * 60 * 60 * 1000);
        
        const resultado = await prisma.analiseViabilidade.deleteMany({
            where: {
                processadoEm: { lt: dataLimite }
            }
        });

        console.log(`🧹 Limpeza: ${resultado.count} análises antigas removidas (>${diasParaManter} dias)`);
        return resultado.count;

    } catch (error) {
        console.error('❌ Erro na limpeza de análises antigas:', error.message);
        return 0;
    }
};

/**
 * 📋 LISTAR CANDIDATOS PENDENTES PARA DEBUG
 */
export const listarCandidatosPendentes = async () => {
    try {
        const pendentesScoreCube = await prisma.candidato.count({
            where: {
                ativo: true,
                instagramHandle: { not: null },
                followersCount: { gt: 0 },
                cargoPretendido: {
                    nome: {
                        OR: [
                            { contains: 'Federal', mode: 'insensitive' },
                            { contains: 'Estadual', mode: 'insensitive' }
                        ]
                    }
                },
                viabilidades: { none: {} }
            }
        });

        const pendentesIA = await prisma.candidato.count({
            where: {
                ativo: true,
                instagramHandle: { not: null },
                followersCount: { gt: 0 },
                cargoPretendido: {
                    nome: {
                        NOT: {
                            OR: [
                                { contains: 'Federal', mode: 'insensitive' },
                                { contains: 'Estadual', mode: 'insensitive' }
                            ]
                        }
                    }
                },
                viabilidades: { none: {} }
            }
        });

        return {
            scoreCube: pendentesScoreCube,
            iaQualitativa: pendentesIA,
            total: pendentesScoreCube + pendentesIA
        };

    } catch (error) {
        console.error('❌ Erro ao listar pendentes:', error.message);
        return { scoreCube: 0, iaQualitativa: 0, total: 0 };
    }
};
