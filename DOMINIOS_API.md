# API de Domínios RSS - Documentação

## Endpoints Disponíveis

### 1. Listar Domínios (Público)
```http
GET /api/dominios
```

**Query Parameters:**
- `ativo` (boolean): Filtrar por domínios ativos (default: true)
- `busca` (string): Buscar por nome ou domínio
- `limit` (number): Limite de resultados (default: 50)
- `isRSSapp` (boolean): Filtrar por tipo RSS app

**Exemplo:**
```http
GET /api/dominios?ativo=true&isRSSapp=false&limit=10
```

### 2. Criar Domínio (Admin)
```http
POST /api/dominios
Authorization: Bearer {token}
```

**Body:**
```json
{
  "nome": "CNN Brasil",
  "dominio": "https://www.cnnbrasil.com.br/politica/ultimas-noticias/",
  "ativo": true,
  "ordem": 1,
  "cor": "#ff0000",
  "isRSSapp": false
}
```

### 3. Atualizar Domínio (Admin)
```http
PUT /api/dominios/{id}
Authorization: Bearer {token}
```

**Body:**
```json
{
  "nome": "CNN Brasil - Política",
  "ativo": true,
  "isRSSapp": true
}
```

### 4. Obter Domínio por ID (Admin)
```http
GET /api/dominios/{id}
Authorization: Bearer {token}
```

### 5. Deletar Domínio (Admin)
```http
DELETE /api/dominios/{id}
Authorization: Bearer {token}
```

### 6. Verificar Domínio (Admin)
```http
POST /api/dominios/{id}/verificar
Authorization: Bearer {token}
```

### 7. Importar Domínios em Lote (Admin)
```http
POST /api/dominios/importar
Authorization: Bearer {token}
```

**Body:**
```json
{
  "dominios": [
    {
      "nome": "G1",
      "dominio": "g1.globo.com",
      "ativo": true,
      "ordem": 1,
      "isRSSapp": false
    },
    {
      "nome": "UOL Notícias",
      "dominio": "https://noticias.uol.com.br/politica/",
      "ativo": true,
      "ordem": 2,
      "isRSSapp": true
    }
  ]
}
```

### 8. Prévia do Domínio (Autenticado)
```http
POST /api/dominios/preview
Authorization: Bearer {token}
```

**Body:**
```json
{
  "dominio": "https://www.cnnbrasil.com.br/politica/ultimas-noticias/"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dominioOriginal": "https://www.cnnbrasil.com.br/politica/ultimas-noticias/",
    "dominioBase": "www.cnnbrasil.com.br",
    "isValid": true,
    "isUrl": true,
    "tipo": "URL Completa",
    "googleNewsUrl": "https://news.google.com/rss/search?q=site:www.cnnbrasil.com.br&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
    "exemplos": {
      "dominioSimples": "cnnbrasil.com.br",
      "urlCompleta": "https://www.cnnbrasil.com.br/politica/ultimas-noticias/"
    }
  },
  "timestamp": "2025-07-15T..."
}
```

## Tipos de Domínio Suportados

### 1. Domínio Simples
```
cnnbrasil.com.br
g1.globo.com
folha.uol.com.br
```

### 2. URL Completa
```
https://www.cnnbrasil.com.br/politica/ultimas-noticias/
https://g1.globo.com/politica/
https://www1.folha.uol.com.br/poder/
```

## Campo isRSSapp

O campo `isRSSapp` indica se o domínio é um aplicativo RSS específico ou um domínio de notícias tradicional:

- `false`: Domínio de notícias tradicional (CNN, G1, Folha, etc.)
- `true`: Aplicativo RSS ou agregador especializado

Este campo pode ser usado no frontend para:
- Aplicar diferentes estilos visuais
- Implementar diferentes estratégias de coleta
- Organizar os domínios por tipo
- Criar filtros específicos
