// jobs/scrapingCronjob.js
import cron from 'node-cron';
import { scrapInstagramProfile } from '../services/apifyService.js';
import { 
    atualizarDadosInstagram, 
    buscarProximoCandidatoParaScraping,
    obterEstatisticasProcessamento,
    buscarCandidatoPorId
} from '../services/candidatoService.js';
import { 
    processarProximoCandidatoComentarios,
    obterEstatisticasComentarios 
} from '../services/comentariosService.js';
import { 
    processarAnalisesSentimentoPendentes 
} from '../services/sentimentoService.js';
import { 
    processarViabilidadesPendentes 
} from '../services/viabilidadeService.js';
import { processarSimulacoesPendentes } from '../services/simuladorCenariosService.js';

// 🔄 SCRAPING DE PERFIS
const executarScraping = async () => {
    try {
        console.log('\n🔄 Iniciando execução do cronjob de scraping...');
        
        const stats = await obterEstatisticasProcessamento();
        if (stats) {
            console.log(`📊 Status do ciclo atual:`);
            console.log(`   Total de candidatos: ${stats.total}`);
            console.log(`   Processados recentemente: ${stats.processadosRecentemente}`);
            console.log(`   Nunca processados: ${stats.nuncaProcessados}`);
            console.log(`   Pendentes: ${stats.pendentes}`);
            
            if (stats.cicloCompleto) {
                console.log(`🔄 Ciclo completo! Todos os candidatos foram processados nos últimos 2 dias.`);
                console.log(`⏳ Aguardando próximo ciclo...`);
            }
        }
        
        const candidato = await buscarProximoCandidatoParaScraping();
        
        if (!candidato) {
            console.log('✅ Nenhum candidato precisa ser processado no momento.');
            return;
        }

        console.log(`\n👤 Processando: ${candidato.nome} (@${candidato.instagramHandle})`);
        
        const instagramUrl = `https://www.instagram.com/${candidato.instagramHandle}/`;
        const dadosApify = await scrapInstagramProfile(instagramUrl);
        
        await atualizarDadosInstagram(candidato.id, dadosApify);
        
        console.log(`✅ ${candidato.nome} processado com sucesso!`);
        console.log(`📈 Seguidores: ${dadosApify.followersCount}`);
        
        const statsAtualizadas = await obterEstatisticasProcessamento();
        if (statsAtualizadas?.cicloCompleto) {
            console.log(`🎉 CICLO COMPLETADO! Todos os ${statsAtualizadas.total} candidatos foram processados.`);
        }
        
    } catch (error) {
        console.error('❌ Erro no cronjob de scraping:', error.message);
    }
};

// 💬 COLETA DE COMENTÁRIOS
const executarScrapingComentarios = async () => {
    try {
        console.log('\n💬 Iniciando coleta de comentários...');
        
        const stats = await obterEstatisticasComentarios();
        if (stats) {
            console.log(`📊 Status dos comentários:`);
            console.log(`   Total de publicações: ${stats.totalPublicacoes}`);
            console.log(`   Com comentários: ${stats.publicacoesComComentarios}`);
            console.log(`   Pendentes: ${stats.publicacoesPendentes}`);
            console.log(`   Total comentários: ${stats.totalComentarios}`);
            console.log(`   Progresso: ${stats.percentualCompleto}%`);
        }
        
        const resultado = await processarProximoCandidatoComentarios();
        
        if (!resultado) {
            console.log('✅ Nenhuma publicação pendente para comentários');
            return;
        }

        console.log(`✅ Comentários processados para ${resultado.publicacao.candidato}`);
        console.log(`💬 ${resultado.comentariosSalvos} novos comentários salvos`);
        
    } catch (error) {
        console.error('❌ Erro no cronjob de comentários:', error.message);
    }
};

// 🧠 ANÁLISE DE SENTIMENTO MELHORADA
const executarAnalisesSentimento = async () => {
    try {
        console.log('\n🧠 Iniciando análises de sentimento...');
        
        // ✅ Verificar se há análises já em progresso (evitar overlaps)
        const emAndamento = global.sentimentoEmAndamento || false;
        if (emAndamento) {
            console.log('⏳ Análise de sentimento já em andamento, pulando...');
            return;
        }

        global.sentimentoEmAndamento = true;

        try {
            const resultado = await processarAnalisesSentimentoPendentes();
            
            if (resultado.processadas === 0) {
                console.log('✅ Nenhuma análise de sentimento pendente');
                return;
            }

            console.log(`✅ Análises de sentimento: ${resultado.processadas} processadas, ${resultado.erros} erros`);
            
            // ✅ Log adicional se muitos erros
            if (resultado.erros > 0) {
                const taxaErro = (resultado.erros / (resultado.processadas + resultado.erros)) * 100;
                if (taxaErro > 30) {
                    console.warn(`⚠️ Taxa de erro elevada: ${taxaErro.toFixed(1)}% - verificar API Gemini`);
                }
            }

        } finally {
            global.sentimentoEmAndamento = false;
        }
        
    } catch (error) {
        global.sentimentoEmAndamento = false;
        console.error('❌ Erro no cronjob de sentimento:', error.message);
    }
};

// 🎯 ANÁLISE DE VIABILIDADE MELHORADA  
const executarAnalisesViabilidade = async () => {
    try {
        console.log('\n🎯 Iniciando análises de viabilidade...');
        
        // ✅ Verificar se há análises já em progresso
        const emAndamento = global.viabilidadeEmAndamento || false;
        if (emAndamento) {
            console.log('⏳ Análise de viabilidade já em andamento, pulando...');
            return;
        }

        global.viabilidadeEmAndamento = true;

        try {
            const resultado = await processarViabilidadesPendentes();
            
            if (resultado.processadas === 0) {
                console.log('✅ Nenhuma análise de viabilidade pendente');
                return;
            }

            console.log(`✅ Análises de viabilidade: ${resultado.processadas} processadas, ${resultado.erros} erros`);
            
            // ✅ Log específico para Score Cube
            if (resultado.processadas > 0) {
                console.log(`📊 Score Cube v2.0 aplicado para candidatos Federal/Estadual`);
            }

            // ✅ Alertar sobre dados insuficientes
            if (resultado.erros > 0) {
                console.warn(`⚠️ Alguns candidatos podem ter dados insuficientes para análise Score Cube`);
                console.warn(`   Verifique: cargo pretendido, votos necessários, dados Instagram`);
            }

        } finally {
            global.viabilidadeEmAndamento = false;
        }
        
    } catch (error) {
        global.viabilidadeEmAndamento = false;
        console.error('❌ Erro no cronjob de viabilidade:', error.message);
    }
};

const executarSimulacoesCenarios = async () => {
    try {
        console.log('\n🎯 Iniciando simulações de cenários...');
        
        const emAndamento = global.cenariosEmAndamento || false;
        if (emAndamento) {
            console.log('⏳ Simulação de cenários já em andamento, pulando...');
            return;
        }

        global.cenariosEmAndamento = true;

        try {
            const resultado = await processarSimulacoesPendentes();
            
            if (resultado.processados === 0) {
                console.log('✅ Nenhuma simulação de cenários pendente');
                return;
            }

            console.log(`✅ Simulações de cenários: ${resultado.processados} processadas, ${resultado.erros} erros`);
            
        } finally {
            global.cenariosEmAndamento = false;
        }
        
    } catch (error) {
        global.cenariosEmAndamento = false;
        console.error('❌ Erro no cronjob de cenários:', error.message);
    }
};

// 🚀 SCRAPING MANUAL POR CANDIDATO
export const executarScrapingPorCandidato = async (candidatoId) => {
    try {
        console.log(`\n🎯 Executando scraping manual para candidato ID: ${candidatoId}`);
        
        const candidato = await buscarCandidatoPorId(candidatoId);
        
        console.log(`👤 Processando: ${candidato.nome} (@${candidato.instagramHandle})`);
        
        const instagramUrl = `https://www.instagram.com/${candidato.instagramHandle}/`;
        const dadosApify = await scrapInstagramProfile(instagramUrl);
        
        await atualizarDadosInstagram(candidato.id, dadosApify);
        
        console.log(`✅ ${candidato.nome} processado com sucesso!`);
        console.log(`📈 Seguidores: ${dadosApify.followersCount}`);
        
        return {
            sucesso: true,
            candidato: {
                id: candidato.id,
                nome: candidato.nome,
                instagramHandle: candidato.instagramHandle
            },
            dadosColetados: {
                followersCount: dadosApify.followersCount,
                followsCount: dadosApify.followsCount,
                postsCount: dadosApify.postsCount,
                verified: dadosApify.verified
            },
            processadoEm: new Date()
        };
        
    } catch (error) {
        console.error('❌ Erro no scraping manual:', error.message);
        throw error;
    }
};

// ⏰ CONFIGURAÇÃO DOS CRON JOBS OTIMIZADA
export const iniciarCronjobScraping = () => {
    // 🔄 Scraping de perfis - a cada 3 minutos
    cron.schedule('*/3 * * * *', executarScraping);
    console.log('⏰ Cronjob de scraping iniciado - roda a cada 3 minutos');

    // 💬 Coleta de comentários - a cada 5 minutos
    cron.schedule('*/5 * * * *', executarScrapingComentarios);
    console.log('⏰ Cronjob de comentários iniciado - roda a cada 5 minutos');

    // 🧠 Análise de sentimento - a cada 3 minutos (reduzido de 2 para evitar overlaps)
    cron.schedule('*/3 * * * *', executarAnalisesSentimento);
    console.log('⏰ Cronjob de sentimento iniciado - roda a cada 3 minutos');

    // 🎯 Análise de viabilidade - a cada 5 minutos (aumentado para dar tempo ao Score Cube)
    cron.schedule('*/5 * * * *', executarAnalisesViabilidade);
    console.log('⏰ Cronjob de viabilidade iniciado - roda a cada 5 minutos');
    
    // Simulador de Cenários - a cada 10 minutos
    cron.schedule('*/10 * * * *', executarSimulacoesCenarios);
    console.log('⏰ Cronjob de cenários iniciado - roda a cada 10 minutos');
    
    console.log('🔄 Processamento híbrido: Score Cube + IA Qualitativa');
    console.log('📅 Score Cube (Federal/Estadual) + IA (Municipal/outros)');
    console.log('🛡️ Proteção contra overlaps e rate limiting\n');
    
    // ✅ Status inicial
    setTimeout(() => {
        console.log('\n📊 STATUS INICIAL DOS CRONJOBS:');
        console.log('🔄 Scraping: Ativo (perfis Instagram)');
        console.log('💬 Comentários: Ativo (coleta automática)');
        console.log('🧠 Sentimento: Ativo (análise Gemini v2.0)');
        console.log('🎯 Viabilidade: Ativo (Score Cube + IA Qualitativa)');
        console.log('⚡ Todos os cronjobs iniciados com sucesso!\n');
    }, 2000);
};

// ⏰ CRONJOB APENAS DE COMENTÁRIOS (para compatibilidade)
export const iniciarCronjobComentarios = () => {
    console.log('✅ Cronjob de comentários já incluído no iniciarCronjobScraping()');
};

// 🔧 FUNÇÕES DE MONITORAMENTO
export const obterStatusCronjobs = () => {
    return {
        scraping: {
            ativo: true,
            intervalo: '5 minutos',
            ultimaExecucao: 'Em execução'
        },
        comentarios: {
            ativo: true,
            intervalo: '8 minutos',
            ultimaExecucao: 'Em execução'
        },
        sentimento: {
            ativo: true,
            intervalo: '3 minutos',
            versao: 'v2.0',
            emAndamento: global.sentimentoEmAndamento || false
        },
        viabilidade: {
            ativo: true,
            intervalo: '5 minutos',
            versao: 'Score Cube v2.0',
            escopo: 'Federal/Estadual',
            emAndamento: global.viabilidadeEmAndamento || false
        }
    };
};

// 🛠️ FUNÇÃO DE TESTE MANUAL
export const testarCronjobs = async () => {
    console.log('\n🧪 TESTANDO TODOS OS CRONJOBS...\n');
    
    try {
        // Teste scraping
        console.log('1️⃣ Testando scraping...');
        await executarScraping();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Teste comentários
        console.log('\n2️⃣ Testando comentários...');
        await executarScrapingComentarios();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Teste sentimento
        console.log('\n3️⃣ Testando sentimento...');
        await executarAnalisesSentimento();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Teste viabilidade
        console.log('\n4️⃣ Testando viabilidade...');
        await executarAnalisesViabilidade();
        
        console.log('\n✅ TODOS OS TESTES CONCLUÍDOS!');
        
    } catch (error) {
        console.error('\n❌ ERRO NOS TESTES:', error.message);
    }
};

export { 
    executarScraping,
    executarScrapingComentarios,
    executarAnalisesSentimento,
    executarAnalisesViabilidade
};