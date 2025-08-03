import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    // Limpar dados existentes para recriar
    await prisma.insightEstrategico.deleteMany({});
    await prisma.candidato.deleteMany({});
    await prisma.macrorregiao.deleteMany({});
    await prisma.cargo.deleteMany({});
    await prisma.usuario.deleteMany({});

    console.log('🗑️  Dados antigos removidos');

    // Criar macrorregiões
    const macrorregioes = [
      { nome: 'Noroeste' },
      { nome: 'Norte' },
      { nome: 'Centro e Centro-Sul' },
      { nome: 'Oeste' },
      { nome: 'Vales do Iguaçu' },
      { nome: 'Campos Gerais' },
      { nome: 'Grande Curitiba' }
    ];

    await prisma.macrorregiao.createMany({
      data: macrorregioes
    });

    console.log('🗺️  Macrorregiões criadas:', macrorregioes.length);

    // Criar cargos políticos brasileiros
    const cargos = [
      // Federais
      { nome: 'Presidente da República', descricao: 'Chefe do Poder Executivo Federal', nivel: 'FEDERAL' },
      { nome: 'Vice-Presidente da República', descricao: 'Vice-Chefe do Poder Executivo Federal', nivel: 'FEDERAL' },
      { nome: 'Senador', descricao: 'Membro do Senado Federal', nivel: 'FEDERAL' },
      { nome: 'Deputado Federal', descricao: 'Membro da Câmara dos Deputados', nivel: 'FEDERAL' },
      { nome: 'Ministro de Estado', descricao: 'Chefe de Ministério Federal', nivel: 'FEDERAL' },
      
      // Estaduais
      { nome: 'Governador', descricao: 'Chefe do Poder Executivo Estadual', nivel: 'ESTADUAL' },
      { nome: 'Vice-Governador', descricao: 'Vice-Chefe do Poder Executivo Estadual', nivel: 'ESTADUAL' },
      { nome: 'Deputado Estadual', descricao: 'Membro da Assembleia Legislativa', nivel: 'ESTADUAL' },
      { nome: 'Secretário de Estado', descricao: 'Chefe de Secretaria Estadual', nivel: 'ESTADUAL' },
      
      // Distritais (específico do DF)
      { nome: 'Governador do Distrito Federal', descricao: 'Chefe do Poder Executivo do DF', nivel: 'DISTRITAL' },
      { nome: 'Vice-Governador do Distrito Federal', descricao: 'Vice-Chefe do Poder Executivo do DF', nivel: 'DISTRITAL' },
      { nome: 'Deputado Distrital', descricao: 'Membro da Câmara Legislativa do DF', nivel: 'DISTRITAL' },
      { nome: 'Secretário do Distrito Federal', descricao: 'Chefe de Secretaria do DF', nivel: 'DISTRITAL' },
      
      // Municipais
      { nome: 'Prefeito', descricao: 'Chefe do Poder Executivo Municipal', nivel: 'MUNICIPAL' },
      { nome: 'Vice-Prefeito', descricao: 'Vice-Chefe do Poder Executivo Municipal', nivel: 'MUNICIPAL' },
      { nome: 'Vereador', descricao: 'Membro da Câmara Municipal', nivel: 'MUNICIPAL' },
      { nome: 'Secretário Municipal', descricao: 'Chefe de Secretaria Municipal', nivel: 'MUNICIPAL' },
      
      // Outros cargos importantes
      { nome: 'Ministro do STF', descricao: 'Ministro do Supremo Tribunal Federal', nivel: 'FEDERAL' },
      { nome: 'Ministro do STJ', descricao: 'Ministro do Superior Tribunal de Justiça', nivel: 'FEDERAL' },
      { nome: 'Desembargador', descricao: 'Magistrado de Tribunal de Justiça', nivel: 'ESTADUAL' },
      { nome: 'Juiz de Direito', descricao: 'Magistrado de primeira instância', nivel: 'ESTADUAL' },
      { nome: 'Procurador-Geral da República', descricao: 'Chefe do Ministério Público Federal', nivel: 'FEDERAL' },
      { nome: 'Procurador de Justiça', descricao: 'Membro do Ministério Público Estadual', nivel: 'ESTADUAL' },
      { nome: 'Promotor de Justiça', descricao: 'Membro do Ministério Público de primeira instância', nivel: 'ESTADUAL' }
    ];

    await prisma.cargo.createMany({
      data: cargos
    });

    console.log('🏛️  Cargos criados:', cargos.length);

    // Criar usuário administrador
    const senhaHash = await bcrypt.hash('admin123', 10);
    
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Administrador',
        email: 'admin@cube.com',
        senha: senhaHash,
        tipo: 'ADMIN'
      }
    });

    console.log('👤 Admin criado:', admin.email);

    console.log(' Seed executado com sucesso!');
    console.log('📊 Dados criados:');
    console.log(`   - ${macrorregioes.length} macrorregiões`);
    console.log(`   - ${cargos.length} cargos`);
    console.log(`   - 1 usuário admin`);

  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Erro no seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });