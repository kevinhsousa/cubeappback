import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

export const scrapInstagramProfile = async (instagramUrl) => {
    try {
        const input = {
            "directUrls": [instagramUrl],
            "resultsType": "details",
            "resultsLimit": 1,
            "addParentData": false,
            "maxPosts": 5
        };

        console.log(`🚀 Iniciando scraping para: ${instagramUrl}`);
        
        const run = await client.actor("shu8hvrXbJbY3Eb9W").call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items.length === 0) {
            throw new Error('Nenhum dado retornado do Apify');
        }

        const dados = items[0];
        
        console.log(`📊 Perfil coletado: ${dados.followersCount} seguidores`);
        if (dados.latestPosts) {
            console.log(`📄 ${dados.latestPosts.length} publicações encontradas`);
        }

        return dados;
    } catch (error) {
        console.error('❌ Erro no Apify:', error.message);
        throw error;
    }
};