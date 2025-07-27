import Parser from 'rss-parser';
import axios from 'axios';
import NodeCache from 'node-cache';
import { URL } from 'url';

// Cache com TTL de 5 minutos para feeds
const cache = new NodeCache({ stdTTL: 300 });

// Configurações
const CONFIG = {
  DEFAULT_TIMEOUT: 15000,   // Mais tolerante
  MAX_RETRIES: 5,           // Mais persistente
  CACHE_TTL: 180,          // 3 minutos (mais fresco)
  MAX_ARTICLES: 200,
  DEFAULT_LIMITS: {
    search: 50,
    category: 30,
    custom: 40
  }
};

// Parser configurado com campos customizados
const parser = new Parser({
  customFields: {
    item: ['description', 'pubDate', 'link', 'title', 'source', 'guid'],
    feed: ['title', 'description', 'link', 'lastBuildDate', 'language']
  },
  timeout: CONFIG.DEFAULT_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; RSS-Reader/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml'
  }
});

class RSSController {
  constructor() {
    this.googleNewsCategories = {
      general: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FuQjBHZ0pDVWlnQVAB',
      business: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FuQjBHZ0pDVWlnQVAB',
      technology: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FuQjBHZ0pDVWlnQVAB',
      entertainment: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FuQjBHZ0pDVWlnQVAB',
      health: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNR3QwTlRFU0FuQjBHZ0pDVWlnQVAB',
      science: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FuQjBHZ0pDVWlnQVAB',
      sports: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FuQjBHZ0pDVWlnQVAB',
      world: 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FuQjBHZ0pDVWlnQVAB'
    };

    this.allowedDomains = [
      'news.google.com',
      'feeds.feedburner.com',
      'rss.cnn.com',
      'feeds.bbci.co.uk',
      'www.reddit.com'
    ];
  }

  // Buscar notícias do Google News RSS com cache e retry
  getGoogleNews = async (req, res) => {
    try {
      const { 
        query = 'Brasil', 
        language = 'pt-BR', 
        country = 'BR', 
        limit = CONFIG.DEFAULT_LIMITS.search,
        dateFrom,
        dateTo,
        dateRange 
      } = req.query;

      // Validação de entrada
      const validatedLimit = this.validateLimit(limit);
      const sanitizedQuery = this.sanitizeQuery(query);
      const dateFilter = this.parseDateFilter({ dateFrom, dateTo, dateRange });
      
      // Chave do cache (inclui filtros de data)
      const cacheKey = `google_news_${sanitizedQuery}_${language}_${country}_${validatedLimit}_${JSON.stringify(dateFilter)}`;
      
      // Verificar cache
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      // URL do Google News RSS
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(sanitizedQuery)}&hl=${language}&gl=${country}&ceid=${country}:${language}`;
      
      
      
      // Buscar com retry
      const feed = await this.fetchWithRetry(rssUrl);
      
      // Processar artigos
      const articles = this.processArticles(feed.items, validatedLimit, null, dateFilter);

      const response = {
        success: true,
        data: {
          title: feed.title || 'Google News',
          description: feed.description || '',
          link: feed.link || '',
          lastBuildDate: feed.lastBuildDate,
          articles
        },
        total: articles.length,
        query: sanitizedQuery,
        dateFilter: dateFilter.applied ? dateFilter : null,
        cached: false
      };

      // Armazenar no cache
      cache.set(cacheKey, response, CONFIG.CACHE_TTL);

      res.json({
        ...response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(res, error, 'Erro ao buscar notícias do Google News');
    }
  }

  // Buscar notícias por categoria com cache
  getNewsByCategory = async (req, res) => {
    try {
      const { category = 'general' } = req.params;
      const { 
        language = 'pt-BR', 
        country = 'BR', 
        limit = CONFIG.DEFAULT_LIMITS.category,
        dateFrom,
        dateTo,
        dateRange 
      } = req.query;
      
      // Validação de categoria
      if (!this.googleNewsCategories[category]) {
        return res.status(400).json({
          success: false,
          error: 'Categoria inválida',
          validCategories: Object.keys(this.googleNewsCategories)
        });
      }

      const validatedLimit = this.validateLimit(limit);
      const dateFilter = this.parseDateFilter({ dateFrom, dateTo, dateRange });
      const cacheKey = `category_${category}_${language}_${country}_${validatedLimit}_${JSON.stringify(dateFilter)}`;
      
      // Verificar cache
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      const categoryId = this.googleNewsCategories[category];
      const rssUrl = `https://news.google.com/rss/topics/${categoryId}?hl=${language}&gl=${country}&ceid=${country}:${language}`;
      
      
      
      const feed = await this.fetchWithRetry(rssUrl);
      const articles = this.processArticles(feed.items, validatedLimit, category, dateFilter);

      const response = {
        success: true,
        data: {
          category,
          title: feed.title || `${category} - Google News`,
          articles
        },
        total: articles.length,
        dateFilter: dateFilter.applied ? dateFilter : null,
        cached: false
      };

      cache.set(cacheKey, response, CONFIG.CACHE_TTL);

      res.json({
        ...response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(res, error, 'Erro ao buscar notícias por categoria');
    }
  }

  // Buscar RSS customizado com validação de segurança
  getCustomRSS = async (req, res) => {
    try {
      const { url } = req.body;
      const { 
        limit = CONFIG.DEFAULT_LIMITS.custom,
        dateFrom,
        dateTo,
        dateRange 
      } = req.query;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL do RSS é obrigatória'
        });
      }

      // Validação de URL
      const validationResult = this.validateURL(url);
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          error: validationResult.error
        });
      }

      const validatedLimit = this.validateLimit(limit);
      const dateFilter = this.parseDateFilter({ dateFrom, dateTo, dateRange });
      const cacheKey = `custom_${Buffer.from(url).toString('base64')}_${validatedLimit}_${JSON.stringify(dateFilter)}`;
      
      // Verificar cache
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      
      
      const feed = await this.fetchWithRetry(url);
      const articles = this.processArticles(feed.items, validatedLimit, null, dateFilter);

      const response = {
        success: true,
        data: {
          title: feed.title || 'RSS Feed',
          description: feed.description || '',
          link: feed.link || '',
          articles
        },
        total: articles.length,
        dateFilter: dateFilter.applied ? dateFilter : null,
        cached: false
      };

      // Cache menor para feeds externos
      cache.set(cacheKey, response, CONFIG.CACHE_TTL / 2);

      res.json({
        ...response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(res, error, 'Erro ao processar RSS customizado');
    }
  }

  // Listar feeds disponíveis
  getAvailableFeeds = async (req, res) => {
    try {
      const feeds = [
        {
          name: 'Google News - Busca',
          description: 'Busca personalizada no Google News',
          endpoint: '/api/rss/google-news',
          method: 'GET',
          parameters: {
            query: { type: 'string', default: 'Brasil', description: 'Termo de busca' },
            language: { type: 'string', default: 'pt-BR', description: 'Idioma do feed' },
            country: { type: 'string', default: 'BR', description: 'País do feed' },
            limit: { type: 'number', default: 20, max: 100, description: 'Limite de artigos' },
            dateFrom: { type: 'string', format: 'YYYY-MM-DD', description: 'Data inicial (formato: YYYY-MM-DD)' },
            dateTo: { type: 'string', format: 'YYYY-MM-DD', description: 'Data final (formato: YYYY-MM-DD)' },
            dateRange: { 
              type: 'string', 
              enum: ['today', 'yesterday', 'last7days', 'last30days', 'last3months'], 
              description: 'Filtro de data pré-definido' 
            }
          }
        },
        {
          name: 'Google News - Categorias',
          description: 'Notícias por categoria específica',
          endpoint: '/api/rss/category/:category',
          method: 'GET',
          categories: Object.keys(this.googleNewsCategories),
          parameters: {
            language: { type: 'string', default: 'pt-BR' },
            country: { type: 'string', default: 'BR' },
            limit: { type: 'number', default: 15, max: 100 },
            dateFrom: { type: 'string', format: 'YYYY-MM-DD', description: 'Data inicial' },
            dateTo: { type: 'string', format: 'YYYY-MM-DD', description: 'Data final' },
            dateRange: { 
              type: 'string', 
              enum: ['today', 'yesterday', 'last7days', 'last30days', 'last3months'], 
              description: 'Filtro de data pré-definido' 
            }
          }
        },
        {
          name: 'RSS Customizado',
          description: 'Feed RSS de URL externa (com validação de segurança)',
          endpoint: '/api/rss/custom',
          method: 'POST',
          parameters: {
            url: { type: 'string', required: true, description: 'URL do feed RSS' },
            limit: { type: 'number', default: 20, max: 100 },
            dateFrom: { type: 'string', format: 'YYYY-MM-DD', description: 'Data inicial' },
            dateTo: { type: 'string', format: 'YYYY-MM-DD', description: 'Data final' },
            dateRange: { 
              type: 'string', 
              enum: ['today', 'yesterday', 'last7days', 'last30days', 'last3months'], 
              description: 'Filtro de data pré-definido' 
            }
          },
          security: {
            allowedDomains: this.allowedDomains,
            note: 'Apenas domínios confiáveis são permitidos'
          }
        }
      ];

      res.json({
        success: true,
        data: feeds,
        cache: {
          enabled: true,
          ttl: CONFIG.CACHE_TTL,
          keys: cache.keys().length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(res, error, 'Erro ao listar feeds');
    }
  }

  // Teste de conectividade aprimorado
  testConnection = async (req, res) => {
    try {
      const tests = [
        {
          name: 'Google News RSS',
          url: 'https://news.google.com/rss/search?q=test&hl=pt-BR&gl=BR&ceid=BR:pt-BR'
        },
        {
          name: 'Google News Categoria',
          url: `https://news.google.com/rss/topics/${this.googleNewsCategories.general}?hl=pt-BR&gl=BR&ceid=BR:pt-BR`
        }
      ];

      const results = await Promise.allSettled(
        tests.map(async (test) => {
          const startTime = Date.now();
          const feed = await parser.parseURL(test.url);
          const responseTime = Date.now() - startTime;
          
          return {
            name: test.name,
            status: 'success',
            responseTime,
            itemCount: feed.items.length,
            feedTitle: feed.title
          };
        })
      );

      const testResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            name: tests[index].name,
            status: 'failed',
            error: result.reason.message
          };
        }
      });

      res.json({
        success: true,
        tests: testResults,
        cache: {
          keys: cache.keys().length,
          stats: cache.getStats()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(res, error, 'Erro ao testar conexões');
    }
  }

  // Limpar cache
  clearCache = async (req, res) => {
    try {
      const keys = cache.keys();
      cache.flushAll();
      
      res.json({
        success: true,
        message: 'Cache limpo com sucesso',
        clearedKeys: keys.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.handleError(res, error, 'Erro ao limpar cache');
    }
  }

  // Métodos auxiliares aprimorados
  validateLimit(limit) {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1) return 10;
    return Math.min(num, CONFIG.MAX_ARTICLES);
  }

  sanitizeQuery(query) {
    if (!query || typeof query !== 'string') return 'Brasil';
    return query.trim().slice(0, 200); // Limitar tamanho
  }

  validateURL(url) {
    try {
      const parsedURL = new URL(url);
      
      // Verificar protocolo
      if (!['http:', 'https:'].includes(parsedURL.protocol)) {
        return { isValid: false, error: 'Apenas URLs HTTP/HTTPS são permitidas' };
      }

      // Verificar domínios permitidos (opcional - remover se quiser permitir todos)
      const isAllowedDomain = this.allowedDomains.some(domain => 
        parsedURL.hostname === domain || parsedURL.hostname.endsWith('.' + domain)
      );

      if (!isAllowedDomain) {
        return { isValid: false, error: 'Domínio não permitido' };
      }

      return { isValid: true, url: parsedURL.href };
    } catch (error) {
      return { isValid: false, error: 'URL inválida' };
    }
  }

  async fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
      try {
        return await parser.parseURL(url);
      } catch (error) {
        console.warn(`[RSS] Tentativa ${i + 1} falhou para ${url}:`, error.message);
        
        if (i === retries - 1) throw error;
        
        // Aguardar antes da próxima tentativa
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * (i + 1)));
      }
    }
  }

  processArticles(items, limit, category = null, dateFilter = null) {
    if (!Array.isArray(items)) return [];

    let processedItems = items.slice(0, limit * 3) // Pegar mais itens inicialmente para filtrar
      .map(item => ({
        title: this.sanitizeText(item.title) || 'Sem título',
        description: this.cleanDescription(item.description || item.contentSnippet || ''),
        link: item.link || '#',
        publishedAt: this.parseDate(item.pubDate),
        source: this.extractSource(item) || 'RSS Feed',
        category: category || null,
        guid: item.guid || item.link || Math.random().toString(36)
      }))
      .filter(article => article.title && article.link); // Filtrar artigos inválidos

    // Aplicar filtro de data se especificado
    if (dateFilter && dateFilter.applied) {
      processedItems = this.filterByDate(processedItems, dateFilter);
    }

    // Retornar apenas o limite solicitado após filtrar
    return processedItems.slice(0, limit);
  }

  sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.trim().slice(0, 500); // Limitar tamanho
  }

  cleanDescription(description) {
    if (!description || typeof description !== 'string') return '';
    
    return description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalizar espaços
      .trim()
      .slice(0, 1000); // Limitar tamanho
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date.toISOString();
    } catch (error) {
      return null;
    }
  }

  // Parse de filtros de data
  parseDateFilter({ dateFrom, dateTo, dateRange }) {
    const filter = {
      applied: false,
      from: null,
      to: null,
      range: null
    };

    // Se dateRange foi especificado, usar predefinições
    if (dateRange) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      switch (dateRange) {
        case 'today':
          filter.from = today;
          filter.to = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
          filter.range = 'hoje';
          break;
        case 'yesterday':
          const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
          filter.from = yesterday;
          filter.to = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1);
          filter.range = 'ontem';
          break;
        case 'last7days':
          filter.from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          filter.to = now;
          filter.range = 'últimos 7 dias';
          break;
        case 'last30days':
          filter.from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
          filter.to = now;
          filter.range = 'últimos 30 dias';
          break;
        case 'last3months':
          filter.from = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
          filter.to = now;
          filter.range = 'últimos 3 meses';
          break;
      }
      filter.applied = true;
    }
    // Se datas específicas foram fornecidas
    else if (dateFrom || dateTo) {
      if (dateFrom) {
        const fromDate = this.parseInputDate(dateFrom);
        if (fromDate) {
          filter.from = fromDate;
          filter.applied = true;
        }
      }
      
      if (dateTo) {
        const toDate = this.parseInputDate(dateTo);
        if (toDate) {
          // Adicionar 23:59:59 ao final do dia
          filter.to = new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1);
          filter.applied = true;
        }
      }
      
      // Se só uma data foi fornecida, ajustar a outra
      if (filter.from && !filter.to) {
        filter.to = new Date(); // Até agora
      } else if (!filter.from && filter.to) {
        filter.from = new Date(0); // Desde o início dos tempos
      }
    }

    return filter;
  }

  // Parse de data de entrada
  parseInputDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    try {
      // Aceitar formatos: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
      let normalizedDate = dateStr;
      
      // Converter DD/MM/YYYY ou DD-MM-YYYY para YYYY-MM-DD
      if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(dateStr)) {
        const parts = dateStr.split(/[\/\-]/);
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      
      const date = new Date(normalizedDate);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  // Filtrar artigos por data
  filterByDate(articles, dateFilter) {
    if (!dateFilter.applied) return articles;
    
    return articles.filter(article => {
      if (!article.publishedAt) return false;
      
      const articleDate = new Date(article.publishedAt);
      if (isNaN(articleDate.getTime())) return false;
      
      let withinRange = true;
      
      if (dateFilter.from) {
        withinRange = withinRange && articleDate >= dateFilter.from;
      }
      
      if (dateFilter.to) {
        withinRange = withinRange && articleDate <= dateFilter.to;
      }
      
      return withinRange;
    });
  }

  extractSource(item) {
    // Múltiplas estratégias para extrair fonte
    const strategies = [
      () => item.source?.name,
      () => typeof item.source === 'string' ? item.source : null,
      () => {
        if (item.link) {
          try {
            const url = new URL(item.link);
            return url.hostname.replace(/^www\./, '');
          } catch (e) {
            return null;
          }
        }
        return null;
      },
      () => {
        // Extrair de meta tags se disponível
        const match = item.title?.match(/^(.+?) - (.+?)$/);
        return match ? match[2] : null;
      }
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result && typeof result === 'string') {
        return result.trim();
      }
    }

    return null;
  }

  handleError(res, error, message) {
    console.error(`[RSS Error] ${message}:`, error);
    
    // Diferentes tipos de erro
    let statusCode = 500;
    let errorMessage = message;
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorMessage = 'Serviço temporariamente indisponível';
    } else if (error.code === 'ETIMEDOUT') {
      statusCode = 504;
      errorMessage = 'Timeout na requisição';
    } else if (error.response?.status) {
      statusCode = error.response.status;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.code,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        stack: error.stack
      })
    });
  }
}

export default new RSSController();