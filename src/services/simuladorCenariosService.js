// services/simuladorCenariosService.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🎯 BANCO DE CONHECIMENTO conforme documento
const BANCO_CONHECIMENTO = {
    "Federal": { "I_ref": 1476.58, "α": 0.6, "β": 0.6 },
    "Estadual": { "I_ref": 587.88, "α": 0.6, "β": 0.6 }
};

/**
 * 🎯 SIMULAR CENÁRIOS PARA UM CANDIDATO
 */
export const simularCenariosCandidato = async (candidatoId) => {
    try {
        console.log(`🎯 Iniciando simulação de cenários para candidato: ${candidatoId}`);

        const candidato = await buscarDadosCompletosCandidato(candidatoId);
        
        if (!candidato) {
            throw new Error('Candidato não encontrado');
        }

        // Validar se é Federal ou Estadual
        const cargoPretendido = candidato.cargoPretendido?.nivel?.toLowerCase() || '';
        const isFederalEstadualPretendido = cargoPretendido.includes('federal') || cargoPretendido.includes('estadual');

        const cargoAtual = candidato.cargo?.nivel?.toLowerCase() || '';
        const isFederalEstadualAtual = cargoAtual.includes('federal') || cargoAtual.includes('estadual');

        console.log(`Cargo pretendido: ${candidato.nome}, Cargo atual: ${cargoAtual}`);

        if (!isFederalEstadualAtual && !isFederalEstadualPretendido) {
            console.log('⏭️ Simulador aplicável apenas a cargos Federal/Estadual');
            return null;
        }

        // Validar dados necessários
        const validacao = validarDadosParaSimulacao(candidato);
        if (!validacao.valido) {
            console.log(`⚠️ Dados insuficientes para simulação: ${validacao.motivo}`);
            // Não salva nada, apenas retorna null
            return null;
        }

        // Executar simulação conforme documento
        const resultadoSimulacao = executarSimulacaoConfomeDocumento(candidato);

        // Verificar se já existe simulação para este candidato
        const simulacaoExistente = await prisma.simuladorCenarios.findFirst({
            where: { candidatoId }
        });

        let simulacao;

        if (simulacaoExistente) {
            // Atualizar simulação existente
            console.log('🔄 Atualizando simulação existente em vez de criar nova');
            simulacao = await prisma.simuladorCenarios.update({
                where: { id: simulacaoExistente.id },
                data: {
                    categoria: resultadoSimulacao.categoria,
                    tipoCanditato: resultadoSimulacao.tipoCanditato,
                    scoreCube: resultadoSimulacao.scoreCube,
                    gapEleitoral: resultadoSimulacao.gapEleitoral,
                    deficitEngajamento: resultadoSimulacao.deficitEngajamento,
                    incerteza: resultadoSimulacao.incerteza,
                    cenarioOtimista: resultadoSimulacao.cenarioOtimista,
                    cenarioRealista: resultadoSimulacao.cenarioRealista,
                    cenarioPessimista: resultadoSimulacao.cenarioPessimista,
                    parametrosCalculo: resultadoSimulacao.parametrosCalculo,
                    processadoEm: new Date(),
                    versaoAlgoritmo: 'v1.0'
                }
            });
        } else {
            // Criar nova simulação apenas se não existir nenhuma
            console.log('🆕 Criando primeira simulação para o candidato');
            simulacao = await prisma.simuladorCenarios.create({
                data: {
                    candidatoId,
                    categoria: resultadoSimulacao.categoria,
                    tipoCanditato: resultadoSimulacao.tipoCanditato,
                    scoreCube: resultadoSimulacao.scoreCube,
                    gapEleitoral: resultadoSimulacao.gapEleitoral,
                    deficitEngajamento: resultadoSimulacao.deficitEngajamento,
                    incerteza: resultadoSimulacao.incerteza,
                    cenarioOtimista: resultadoSimulacao.cenarioOtimista,
                    cenarioRealista: resultadoSimulacao.cenarioRealista,
                    cenarioPessimista: resultadoSimulacao.cenarioPessimista,
                    parametrosCalculo: resultadoSimulacao.parametrosCalculo,
                    versaoAlgoritmo: 'v1.0'
                }
            });
        }

        console.log(`✅ Cenários calculados: O:${resultadoSimulacao.cenarioOtimista}% R:${resultadoSimulacao.cenarioRealista}% P:${resultadoSimulacao.cenarioPessimista}%`);
        
        return simulacao;

    } catch (error) {
        console.error('❌ Erro na simulação de cenários:', error.message);
        return null;
    }
};

/**
 * 🎯 EXECUTAR SIMULAÇÃO CONFORME DOCUMENTO OFICIAL
 */
const executarSimulacaoConfomeDocumento = (candidato) => {
    try {
        // 1. Definir categoria baseada no cargo
        const cargoPretendido = candidato.cargoPretendido?.nome?.toLowerCase() || '';
        const categoria = cargoPretendido.includes('federal') ? 'Federal' : 'Estadual';

        // 2. Coletar I_ref, α, β do banco
        const { I_ref, α, β } = BANCO_CONHECIMENTO[categoria];

        // 3. Classificar tipo de candidato
        const VOTOS_CANDIDATO = candidato.votosUltimaEleicao || 0;
        const tipoCanditato = VOTOS_CANDIDATO > 0 ? 'VETERANO' : 'ESTREANTE';

        // 4. Calcular votos necessários se não informado
        let VOTOS_NECESSARIOS = candidato.votosNecessarios || 0;
        if (VOTOS_NECESSARIOS === 0) {
            VOTOS_NECESSARIOS = categoria === 'Federal' ? 120000 : 45000;
        }

        // 5. Calcular Taxa de Engajamento (TE)
        const seguidores = candidato.followersCount || 0;
        const engajamentoMedio = calcularEngajamentoMedio(candidato);
        const TE = seguidores > 0 ? (engajamentoMedio / seguidores) * 100 : 0;

        // 6. Razão de engajamento R_E = min(TE ÷ 1%, 1)
        const R_E = Math.min(TE / 1, 1);

        // 7. Razão de votos/interações
        let razaoEspecifica = 0;
        if (tipoCanditato === 'VETERANO') {
            // R_V = min(VOTOS_CANDIDATO ÷ VOTOS_NECESSARIOS, 1)
            razaoEspecifica = Math.min(VOTOS_CANDIDATO / VOTOS_NECESSARIOS, 1);
        } else {
            // R_I = min(INT_MEDIAS ÷ I_ref, 1)
            razaoEspecifica = Math.min(engajamentoMedio / I_ref, 1);
        }

        // 8. Score Cube S (%) - conforme documento
        const S = (0.5 * razaoEspecifica + 0.5 * R_E) * 100;

        // 9. Gap eleitoral G = |VOTOS_NECESSARIOS - VOTOS_CANDIDATO| ÷ VOTOS_NECESSARIOS
        const G = Math.abs(VOTOS_NECESSARIOS - VOTOS_CANDIDATO) / VOTOS_NECESSARIOS;

        // 10. Déficit de engajamento D = max(0, 1% - TE) ÷ 1%
        const D = Math.max(0, 1 - TE) / 1;

        // 11. Incerteza U = 0.5 × (G + D)
        const U = 0.5 * (G + D);

        // 12. Cenários conforme documento
        const cenarioRealista = Math.round(S);
        const cenarioOtimista = Math.round(Math.min(100, S + (100 - S) * α * U));
        const cenarioPessimista = Math.round(Math.max(0, S - S * β * U));

        return {
            categoria,
            tipoCanditato,
            scoreCube: parseFloat(S.toFixed(2)),
            gapEleitoral: parseFloat(G.toFixed(4)),
            deficitEngajamento: parseFloat(D.toFixed(4)),
            incerteza: parseFloat(U.toFixed(4)),
            cenarioOtimista,
            cenarioRealista,
            cenarioPessimista,
            parametrosCalculo: {
                I_ref,
                α,
                β,
                VOTOS_CANDIDATO,
                VOTOS_NECESSARIOS,
                TE: parseFloat(TE.toFixed(3)),
                R_E: parseFloat(R_E.toFixed(3)),
                razaoEspecifica: parseFloat(razaoEspecifica.toFixed(3)),
                engajamentoMedio: Math.round(engajamentoMedio),
                seguidores,
                calculadoEm: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('❌ Erro na execução da simulação:', error.message);
        throw error;
    }
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
 * ✅ Validar dados necessários para simulação
 */
const validarDadosParaSimulacao = (candidato) => {
    const problemas = [];

    if (!candidato.cargoPretendido?.nome) {
        problemas.push('Cargo pretendido não definido');
    }

    const cargoPretendido = candidato.cargoPretendido?.nivel?.toLowerCase() || '';
    const isFederalEstadualPretendido = cargoPretendido.includes('federal') || cargoPretendido.includes('estadual');

    const cargoAtual = candidato.cargo?.nivel?.toLowerCase() || '';
    const isFederalEstadualAtual = cargoAtual.includes('federal') || cargoAtual.includes('estadual');

    console.log(`Cargo pretendido: ${cargoPretendido}, Cargo atual: ${cargoAtual}`);

    if (!isFederalEstadualPretendido && !isFederalEstadualAtual) {
        problemas.push('Simulador aplicável apenas a cargos Federal/Estadual');
    }

    if (!candidato.followersCount || candidato.followersCount === 0) {
        problemas.push('Sem dados de seguidores do Instagram');
    }

    if (!candidato.publicacoes || candidato.publicacoes.length === 0) {
        problemas.push('Sem publicações para calcular engajamento');
    }

    return {
        valido: problemas.length === 0,
        motivo: problemas.join('; ') || 'Dados suficientes para simulação'
    };
};

/**
 * 🔍 Buscar dados completos do candidato
 */
const buscarDadosCompletosCandidato = async (candidatoId) => {
    return await prisma.candidato.findUnique({
        where: { id: candidatoId },
        include: {
            cargoPretendido: { select: { nome: true, nivel: true } },
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
 * 💾 Salvar simulação incompleta
 */
const salvarSimulacaoIncompleta = async (candidatoId, motivo) => {
    return await prisma.simuladorCenarios.create({
        data: {
            candidatoId,
            categoria: 'N/A',
            tipoCanditato: 'INDETERMINADO',
            scoreCube: 0.0,
            gapEleitoral: 0.0,
            deficitEngajamento: 0.0,
            incerteza: 0.0,
            cenarioOtimista: 0,
            cenarioRealista: 0,
            cenarioPessimista: 0,
            parametrosCalculo: { erro: motivo },
            versaoAlgoritmo: 'v1.0-erro'
        }
    });
};

/**
 * 📊 OBTER SIMULAÇÕES POR CARGO (para tabelas do documento)
 */
export const obterSimulacoesPorCargo = async () => {
    try {
        const simulacoes = await prisma.simuladorCenarios.findMany({
            where: {
                categoria: { in: ['Federal', 'Estadual'] },
                cenarioRealista: { gt: 0 } // Apenas simulações válidas
            },
            include: {
                candidato: {
                    select: {
                        nome: true,
                        cargoPretendido: { select: { nome: true } }
                    }
                }
            },
            orderBy: [
                { categoria: 'asc' },
                { cenarioRealista: 'desc' }
            ]
        });

        // Agrupar por cargo conforme formato do documento
        const federal = simulacoes.filter(s => s.categoria === 'Federal');
        const estadual = simulacoes.filter(s => s.categoria === 'Estadual');

        return {
            federal: federal.map(s => ({
                nome: s.candidato.nome,
                tipo: s.tipoCanditato === 'VETERANO' ? 'V' : 'Est',
                otimista: s.cenarioOtimista,
                realista: s.cenarioRealista,
                pessimista: s.cenarioPessimista
            })),
            estadual: estadual.map(s => ({
                nome: s.candidato.nome,
                tipo: s.tipoCanditato === 'VETERANO' ? 'V' : 'Est',
                otimista: s.cenarioOtimista,
                realista: s.cenarioRealista,
                pessimista: s.cenarioPessimista
            })),
            metadados: {
                totalFederal: federal.length,
                totalEstadual: estadual.length,
                processadoEm: new Date().toISOString(),
                versaoAlgoritmo: 'v1.0'
            }
        };

    } catch (error) {
        console.error('❌ Erro ao obter simulações por cargo:', error.message);
        return { federal: [], estadual: [], metadados: { erro: error.message } };
    }
};

/**
 * 🔄 PROCESSAR SIMULAÇÕES PENDENTES
 */
export const processarSimulacoesPendentes = async () => {
    try {
        console.log('🔄 Buscando candidatos pendentes para simulação de cenários...');
        
        // Buscar candidatos Federal/Estadual sem simulação recente
        const candidatosPendentes = await prisma.candidato.findMany({
            where: {
                ativo: true,
                instagramHandle: { not: null },
                followersCount: { gt: 0 },
                cargoPretendido: {
                    OR: [
                        { nome: { contains: 'Federal', mode: 'insensitive' } },
                        { nome: { contains: 'Estadual', mode: 'insensitive' } },
                        { nome: { contains: 'Deputado Federal', mode: 'insensitive' } },
                        { nome: { contains: 'Deputado Estadual', mode: 'insensitive' } },
                        { nome: { contains: 'Senador', mode: 'insensitive' } }
                    ]
                },
                // Não tem simulação OU simulação é antiga (>24h)
                OR: [
                    { simulacoesCenarios: { none: {} } }, // ✅ CORRIGIDO: era 'cenarios'
                    {
                        simulacoesCenarios: { // ✅ CORRIGIDO: era 'cenarios'
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
            take: 5 // Processar 5 por vez
        });

        if (candidatosPendentes.length === 0) {
            console.log('✅ Nenhum candidato pendente para simulação de cenários');
            return { processados: 0, erros: 0 };
        }

        console.log(`🎯 Encontrados ${candidatosPendentes.length} candidatos para simulação`);

        let processados = 0;
        let erros = 0;

        for (const candidato of candidatosPendentes) {
            try {
                console.log(`🎯 Simulando cenários: ${candidato.nome} (${candidato.cargoPretendido?.nome})`);
                
                await simularCenariosCandidato(candidato.id);
                processados++;
                
                // Delay entre processamentos
                await new Promise(resolve => setTimeout(resolve, 3000));
                
            } catch (error) {
                console.error(`❌ Erro ao simular ${candidato.nome}:`, error.message);
                erros++;
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`✅ Simulações concluídas: ${processados} sucessos, ${erros} erros`);
        return { processados, erros };

    } catch (error) {
        console.error('❌ Erro no processamento batch de simulações:', error.message);
        return { processados: 0, erros: 1 };
    }
};

/**
 * 📋 ESTATÍSTICAS DAS SIMULAÇÕES
 */
export const obterEstatisticasSimulacoes = async () => {
    try {
        const total = await prisma.simuladorCenarios.count({
            where: { cenarioRealista: { gt: 0 } }
        });

        const porCategoria = await prisma.simuladorCenarios.groupBy({
            by: ['categoria'],
            where: { cenarioRealista: { gt: 0 } },
            _count: { categoria: true },
            _avg: {
                cenarioOtimista: true,
                cenarioRealista: true,
                cenarioPessimista: true
            }
        });

        const porTipo = await prisma.simuladorCenarios.groupBy({
            by: ['tipoCanditato'],
            where: { cenarioRealista: { gt: 0 } },
            _count: { tipoCanditato: true }
        });

        return {
            total,
            porCategoria: porCategoria.reduce((acc, item) => {
                acc[item.categoria] = {
                    total: item._count.categoria,
                    mediaOtimista: Math.round(item._avg.cenarioOtimista || 0),
                    mediaRealista: Math.round(item._avg.cenarioRealista || 0),
                    mediaPessimista: Math.round(item._avg.cenarioPessimista || 0)
                };
                return acc;
            }, {}),
            porTipo: porTipo.reduce((acc, item) => {
                acc[item.tipoCanditato] = item._count.tipoCanditato;
                return acc;
            }, {}),
            algoritmo: {
                versao: 'v1.0',
                bancoConhecimento: BANCO_CONHECIMENTO,
                ultimaAtualizacao: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('❌ Erro ao obter estatísticas de simulações:', error.message);
        return { total: 0, erro: error.message };
    }
};
