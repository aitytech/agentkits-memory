<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>por <strong>AityTech</strong></em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aitytech/agentkits-memory"><img src="https://img.shields.io/npm/v/@aitytech/agentkits-memory.svg" alt="npm"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Claude_Code-Compatible-blueviolet" alt="Claude Code">
  <img src="https://img.shields.io/badge/Cursor-Compatible-blue" alt="Cursor">
  <img src="https://img.shields.io/badge/Windsurf-Compatible-cyan" alt="Windsurf">
  <img src="https://img.shields.io/badge/Cline-Compatible-orange" alt="Cline">
  <img src="https://img.shields.io/badge/OpenCode-Compatible-green" alt="OpenCode">
</p>

<p align="center">
  <strong>Sistema de Memória Persistente para Assistentes de Codificação com IA</strong>
</p>

<p align="center">
  Seu assistente de IA esquece tudo entre as sessões. AgentKits Memory resolve isso.<br>
  Decisões, padrões, erros e contexto — tudo persistido localmente via MCP.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">Site</a> •
  <a href="https://www.agentkits.net/memory/docs">Documentação</a> •
  <a href="#início-rápido">Início Rápido</a> •
  <a href="#como-funciona">Como Funciona</a> •
  <a href="#suporte-multiplataforma">Plataformas</a> •
  <a href="#comandos-cli">CLI</a> •
  <a href="#visualizador-web">Visualizador Web</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <strong>Português</strong> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## Recursos

| Recurso | Benefício |
|---------|-----------|
| **100% Local** | Todos os dados ficam na sua máquina. Sem nuvem, sem chaves de API, sem contas |
| **Extremamente Rápido** | SQLite nativo (better-sqlite3) = consultas instantâneas, latência zero |
| **Zero Configuração** | Funciona imediatamente. Sem necessidade de configurar banco de dados |
| **Multiplataforma** | Claude Code, Cursor, Windsurf, Cline, OpenCode — um único comando de configuração |
| **Servidor MCP** | 9 ferramentas: save, search, timeline, details, recall, list, update, delete, status |
| **Captura Automática** | Hooks capturam contexto da sessão, uso de ferramentas e resumos automaticamente |
| **Enriquecimento com IA** | Workers em segundo plano enriquecem observações com resumos gerados por IA |
| **Busca Vetorial** | Similaridade semântica HNSW com embeddings multilíngues (mais de 100 idiomas) |
| **Visualizador Web** | Interface no navegador para visualizar, buscar, adicionar, editar e excluir memórias |
| **Busca em 3 Camadas** | Divulgação progressiva economiza ~87% de tokens vs buscar tudo |
| **Gerenciamento de Ciclo de Vida** | Compacta, arquiva e limpa automaticamente sessões antigas |
| **Exportar/Importar** | Backup e restauração de memórias em formato JSON |

---

## Como Funciona

```
Sessão 1: "Usar JWT para autenticação"    Sessão 2: "Adicionar endpoint de login"
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  Você codifica com IA...     │          │  IA já sabe:                 │
│  IA toma decisões            │          │  ✓ Decisão de auth JWT       │
│  IA encontra erros           │   ───►   │  ✓ Soluções de erros         │
│  IA aprende padrões          │  salvo   │  ✓ Padrões de código         │
│                              │          │  ✓ Contexto da sessão        │
└──────────────────────────────┘          └──────────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% local)
```

1. **Configure uma vez** — `npx agentkits-memory-setup` configura sua plataforma
2. **Captura automática** — Hooks registram decisões, uso de ferramentas e resumos enquanto você trabalha
3. **Injeção de contexto** — Próxima sessão começa com histórico relevante de sessões passadas
4. **Processamento em segundo plano** — Workers enriquecem observações com IA, geram embeddings, compactam dados antigos
5. **Busca a qualquer momento** — IA usa ferramentas MCP (`memory_search` → `memory_details`) para encontrar contexto passado

Todos os dados ficam em `.claude/memory/memory.db` na sua máquina. Sem nuvem. Sem necessidade de chaves de API.

---

## Decisões de Design que Importam

A maioria das ferramentas de memória espalha dados em arquivos markdown, requer runtimes Python ou envia seu código para APIs externas. AgentKits Memory faz escolhas fundamentalmente diferentes:

| Escolha de Design | Por que Importa |
|-------------------|-----------------|
| **Banco de dados SQLite único** | Um arquivo (`memory.db`) contém tudo — memórias, sessões, observações, embeddings. Sem arquivos espalhados para sincronizar, sem conflitos de merge, sem dados órfãos. Backup = copiar um arquivo |
| **Node.js nativo, zero Python** | Roda onde o Node roda. Sem conda, sem pip, sem virtualenv. Mesma linguagem que seu servidor MCP — um comando `npx`, pronto |
| **Busca em 3 camadas eficiente em tokens** | Busca primeiro no índice (~50 tokens/resultado), depois contexto da timeline, depois detalhes completos. Busque apenas o que você precisa. Outras ferramentas despejam arquivos de memória inteiros no contexto, queimando tokens em conteúdo irrelevante |
| **Captura automática via hooks** | Decisões, padrões e erros são registrados conforme acontecem — não depois que você se lembra de salvá-los. Injeção de contexto da sessão acontece automaticamente no início da próxima sessão |
| **Embeddings locais, sem chamadas de API** | Busca vetorial usa um modelo ONNX local (multilingual-e5-small). Busca semântica funciona offline, não custa nada e suporta mais de 100 idiomas |
| **Workers em segundo plano** | Enriquecimento com IA, geração de embeddings e compactação rodam de forma assíncrona. Seu fluxo de codificação nunca é bloqueado |
| **Multiplataforma desde o início** | Um único comando `--platform=all` configura Claude Code, Cursor, Windsurf, Cline e OpenCode simultaneamente. Mesmo banco de dados de memória, editores diferentes |
| **Dados de observação estruturados** | Uso de ferramentas é capturado com classificação de tipo (read/write/execute/search), rastreamento de arquivos, detecção de intenção e narrativas geradas por IA — não dumps de texto bruto |
| **Sem vazamento de processos** | Workers em segundo plano se auto-encerram após 5 minutos, usam arquivos de bloqueio baseados em PID com limpeza de bloqueios obsoletos e lidam graciosamente com SIGTERM/SIGINT. Sem processos zumbis, sem workers órfãos |
| **Sem vazamento de memória** | Hooks rodam como processos de curta duração (não daemons de longa duração). Conexões de banco de dados fecham no desligamento. Subprocesso de embedding tem respawn limitado (máx 2), timeouts de requisições pendentes e limpeza graciosa de todos os timers e filas |

---

## Visualizador Web

Visualize e gerencie suas memórias através de uma interface web moderna.

```bash
npx agentkits-memory-web
```

Depois abra **http://localhost:1905** no seu navegador.

### Lista de Memórias

Navegue por todas as memórias armazenadas com busca e filtragem por namespace.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list.png)

### Adicionar Memória

Crie novas memórias com chave, namespace, tipo, conteúdo e tags.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory.png)

### Detalhes da Memória

Visualize detalhes completos da memória com opções de edição e exclusão.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail.png)

### Gerenciar Embeddings

Gere e gerencie embeddings vetoriais para busca semântica.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding.png)

---

## Início Rápido

### 1. Configuração (Recomendado)

```bash
npx agentkits-memory-setup
```

Isso detecta automaticamente sua plataforma e configura tudo: servidor MCP, hooks (Claude Code/OpenCode), arquivos de regras (Cursor/Windsurf/Cline) e baixa o modelo de embedding.

**Direcionar para uma plataforma específica:**

```bash
npx agentkits-memory-setup --platform=cursor
npx agentkits-memory-setup --platform=windsurf,cline
npx agentkits-memory-setup --platform=all
```

### 2. Configuração Manual do MCP (Alternativa)

Se preferir configuração manual, adicione ao seu arquivo de configuração MCP:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "agentkits-memory-server"]
    }
  }
}
```

Localizações dos arquivos de configuração:
- **Claude Code**: `.claude/settings.json` (embutido na chave `mcpServers`)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (raiz do projeto)

### 3. Ferramentas MCP

Uma vez configurado, seu assistente de IA pode usar estas ferramentas:

| Ferramenta | Descrição |
|------------|-----------|
| `memory_status` | Verificar status do sistema de memória (chame primeiro!) |
| `memory_save` | Salvar decisões, padrões, erros ou contexto |
| `memory_search` | **[Passo 1]** Buscar índice — IDs e títulos leves (~50 tokens/resultado) |
| `memory_timeline` | **[Passo 2]** Obter contexto temporal ao redor de uma memória |
| `memory_details` | **[Passo 3]** Obter conteúdo completo para IDs específicos |
| `memory_recall` | Visão geral rápida de tópico — resumo agrupado |
| `memory_list` | Listar memórias recentes |
| `memory_update` | Atualizar conteúdo ou tags de memória existente |
| `memory_delete` | Remover memórias desatualizadas |

---

## Divulgação Progressiva (Busca Eficiente em Tokens)

AgentKits Memory usa um **padrão de busca em 3 camadas** que economiza ~70% de tokens comparado a buscar conteúdo completo antecipadamente.

### Como Funciona

```
┌─────────────────────────────────────────────────────────────┐
│  Passo 1: memory_search                                     │
│  Retorna: IDs, títulos, tags, pontuações (~50 tokens/item)  │
│  → Revisar índice, escolher memórias relevantes             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Passo 2: memory_timeline (opcional)                        │
│  Retorna: Contexto ±30 minutos ao redor da memória          │
│  → Entender o que aconteceu antes/depois                    │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Passo 3: memory_details                                    │
│  Retorna: Conteúdo completo apenas para IDs selecionados    │
│  → Buscar apenas o que você realmente precisa               │
└─────────────────────────────────────────────────────────────┘
```

### Exemplo de Fluxo de Trabalho

```typescript
// Passo 1: Buscar - obter índice leve
memory_search({ query: "authentication" })
// → Retorna: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// Passo 2: (Opcional) Ver contexto temporal
memory_timeline({ anchor: "abc" })
// → Retorna: O que aconteceu antes/depois desta memória

// Passo 3: Obter conteúdo completo apenas do que você precisa
memory_details({ ids: ["abc"] })
// → Retorna: Conteúdo completo da memória selecionada
```

### Economia de Tokens

| Abordagem | Tokens Usados |
|-----------|---------------|
| **Antiga:** Buscar todo o conteúdo | ~500 tokens × 10 resultados = 5000 tokens |
| **Nova:** Divulgação progressiva | 50 × 10 + 500 × 2 = 1500 tokens |
| **Economia** | **70% de redução** |

---

## Comandos CLI

```bash
# Configuração com um comando (detecta plataforma automaticamente)
npx agentkits-memory-setup
npx agentkits-memory-setup --platform=cursor      # plataforma específica
npx agentkits-memory-setup --platform=all          # todas as plataformas
npx agentkits-memory-setup --force                 # reinstalar/atualizar

# Iniciar servidor MCP
npx agentkits-memory-server

# Visualizador web (porta 1905)
npx agentkits-memory-web

# Visualizador de terminal
npx agentkits-memory-viewer
npx agentkits-memory-viewer --stats                # estatísticas do banco de dados
npx agentkits-memory-viewer --json                 # saída JSON

# Salvar via CLI
npx agentkits-memory-save "Use JWT with refresh tokens" --category pattern --tags auth,security

# Configurações
npx agentkits-memory-hook settings .               # ver configurações atuais
npx agentkits-memory-hook settings . --reset       # resetar para padrões
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# Exportar / Importar
npx agentkits-memory-hook export . my-project ./backup.json
npx agentkits-memory-hook import . ./backup.json

# Gerenciamento de ciclo de vida
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30
npx agentkits-memory-hook lifecycle-stats .
```

---

## Uso Programático

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// Armazenar uma memória
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// Consultar memórias
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// Obter por chave
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## Hooks de Captura Automática

Hooks capturam automaticamente suas sessões de codificação com IA (Claude Code e OpenCode apenas):

| Hook | Gatilho | Ação |
|------|---------|------|
| `context` | Início da Sessão | Injeta contexto da sessão anterior + status da memória |
| `session-init` | Prompt do Usuário | Inicializa/retoma sessão, registra prompts |
| `observation` | Após Uso de Ferramenta | Captura uso de ferramenta com detecção de intenção |
| `summarize` | Fim da Sessão | Gera resumo estruturado da sessão |
| `user-message` | Início da Sessão | Exibe status da memória para o usuário (stderr) |

Configurar hooks:
```bash
npx agentkits-memory-setup
```

**O que é capturado automaticamente:**
- Leituras/escritas de arquivos com caminhos
- Mudanças de código como diffs estruturados (antes → depois)
- Intenção do desenvolvedor (bugfix, feature, refactor, investigation, etc.)
- Resumos de sessão com decisões, erros e próximos passos
- Rastreamento de múltiplos prompts dentro de sessões

---

## Suporte Multiplataforma

| Plataforma | MCP | Hooks | Arquivo de Regras | Configuração |
|------------|-----|-------|-------------------|--------------|
| **Claude Code** | `.claude/settings.json` | ✅ Completo | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ Completo | — | `--platform=opencode` |

- **Servidor MCP** funciona com todas as plataformas (ferramentas de memória via protocolo MCP)
- **Hooks** fornecem captura automática no Claude Code e OpenCode
- **Arquivos de regras** ensinam ao Cursor/Windsurf/Cline o fluxo de trabalho de memória
- **Dados de memória** sempre armazenados em `.claude/memory/` (fonte única da verdade)

---

## Workers em Segundo Plano

Após cada sessão, workers em segundo plano processam tarefas enfileiradas:

| Worker | Tarefa | Descrição |
|--------|--------|-----------|
| `embed-session` | Embeddings | Gera embeddings vetoriais para busca semântica |
| `enrich-session` | Enriquecimento com IA | Enriquece observações com resumos, fatos e conceitos gerados por IA |
| `compress-session` | Compactação | Compacta observações antigas (10:1–25:1) e gera resumos de sessão (20:1–100:1) |

Workers rodam automaticamente após o fim da sessão. Cada worker:
- Processa até 200 itens por execução
- Usa arquivos de bloqueio para prevenir execução concorrente
- Auto-encerra após 5 minutos (previne zumbis)
- Retentar tarefas falhadas até 3 vezes

---

## Configuração de Provedor de IA

Enriquecimento com IA usa provedores plugáveis. Padrão é `claude-cli` (sem necessidade de chave de API).

| Provedor | Tipo | Modelo Padrão | Notas |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | Usa `claude --print`, sem necessidade de chave de API |
| **OpenAI** | `openai` | `gpt-4o-mini` | Qualquer modelo OpenAI |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Chave do Google AI Studio |
| **OpenRouter** | `openai` | qualquer | Defina `baseUrl` para `https://openrouter.ai/api/v1` |
| **GLM (Zhipu)** | `openai` | qualquer | Defina `baseUrl` para `https://open.bigmodel.cn/api/paas/v4` |
| **Ollama** | `openai` | qualquer | Defina `baseUrl` para `http://localhost:11434/v1` |

### Opção 1: Variáveis de Ambiente

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (usa formato compatível com OpenAI)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# Ollama local (sem necessidade de chave de API)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# Desabilitar enriquecimento com IA completamente
export AGENTKITS_AI_ENRICHMENT=false
```

### Opção 2: Configurações Persistentes

```bash
# Salvo em .claude/memory/settings.json — persiste entre sessões
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx agentkits-memory-hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx agentkits-memory-hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# Ver configurações atuais
npx agentkits-memory-hook settings .

# Resetar para padrões
npx agentkits-memory-hook settings . --reset
```

> **Prioridade:** Variáveis de ambiente sobrepõem settings.json. Settings.json sobrepõe padrões.

---

## Gerenciamento de Ciclo de Vida

Gerencie o crescimento da memória ao longo do tempo:

```bash
# Compactar observações com mais de 7 dias, arquivar sessões com mais de 30 dias
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30

# Também auto-deletar sessões arquivadas com mais de 90 dias
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# Ver estatísticas de ciclo de vida
npx agentkits-memory-hook lifecycle-stats .
```

| Estágio | O que Acontece |
|---------|----------------|
| **Compactar** | IA compacta observações, gera resumos de sessão |
| **Arquivar** | Marca sessões antigas como arquivadas (excluídas do contexto) |
| **Deletar** | Remove sessões arquivadas (opt-in, requer `--delete`) |

---

## Exportar / Importar

Faça backup e restaure suas memórias de projeto:

```bash
# Exportar todas as sessões de um projeto
npx agentkits-memory-hook export . my-project ./backup.json

# Importar do backup (deduplica automaticamente)
npx agentkits-memory-hook import . ./backup.json
```

Formato de exportação inclui sessões, observações, prompts e resumos.

---

## Categorias de Memória

| Categoria | Caso de Uso |
|-----------|-------------|
| `decision` | Decisões de arquitetura, escolhas de stack tecnológico, trade-offs |
| `pattern` | Convenções de codificação, padrões de projeto, abordagens recorrentes |
| `error` | Correções de bugs, soluções de erros, insights de debugging |
| `context` | Contexto do projeto, convenções de equipe, configuração de ambiente |
| `observation` | Observações de sessão capturadas automaticamente |

---

## Armazenamento

Memórias são armazenadas em `.claude/memory/` dentro do diretório do seu projeto.

```
.claude/memory/
├── memory.db          # Banco de dados SQLite (todos os dados)
├── memory.db-wal      # Write-ahead log (temporário)
├── settings.json      # Configurações persistentes (provedor de IA, config de contexto)
└── embeddings-cache/  # Cache de embeddings vetoriais
```

---

## Suporte a Idiomas CJK

AgentKits Memory tem **suporte automático a CJK** para busca de texto em chinês, japonês e coreano.

### Zero Configuração

Quando `better-sqlite3` está instalado (padrão), busca CJK funciona automaticamente:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// Armazenar conteúdo CJK
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// Buscar em japonês, chinês ou coreano - simplesmente funciona!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### Como Funciona

- **SQLite Nativo**: Usa `better-sqlite3` para máxima performance
- **Tokenizador trigram**: FTS5 com trigram cria sequências de 3 caracteres para correspondência CJK
- **Fallback inteligente**: Consultas CJK curtas (< 3 caracteres) automaticamente usam busca LIKE
- **Ranking BM25**: Pontuação de relevância para resultados de busca

### Avançado: Segmentação de Palavras em Japonês

Para japonês avançado com segmentação de palavras adequada, opcionalmente use lindera:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

Requer build do [lindera-sqlite](https://github.com/lindera/lindera-sqlite).

---

## Referência da API

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // Padrão: '.claude/memory'
  dbFilename: string;           // Padrão: 'memory.db'
  enableVectorIndex: boolean;   // Padrão: false
  dimensions: number;           // Padrão: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // Padrão: true
  cacheSize: number;            // Padrão: 1000
  cacheTtl: number;             // Padrão: 300000 (5 min)
}
```

### Métodos

| Método | Descrição |
|--------|-----------|
| `initialize()` | Inicializar o serviço de memória |
| `shutdown()` | Desligar e persistir mudanças |
| `storeEntry(input)` | Armazenar uma entrada de memória |
| `get(id)` | Obter entrada por ID |
| `getByKey(namespace, key)` | Obter entrada por namespace e chave |
| `update(id, update)` | Atualizar uma entrada |
| `delete(id)` | Deletar uma entrada |
| `query(query)` | Consultar entradas com filtros |
| `semanticSearch(content, k)` | Busca por similaridade semântica |
| `count(namespace?)` | Contar entradas |
| `listNamespaces()` | Listar todos os namespaces |
| `getStats()` | Obter estatísticas |

---

## Requisitos

- **Node.js LTS**: 18.x, 20.x ou 22.x (recomendado)
- Assistente de codificação com IA compatível com MCP

### Notas sobre Versão do Node.js

Este pacote usa `better-sqlite3` que requer binários nativos. **Binários pré-compilados estão disponíveis apenas para versões LTS**.

| Versão do Node | Status | Notas |
|----------------|--------|-------|
| 18.x LTS | ✅ Funciona | Binários pré-compilados |
| 20.x LTS | ✅ Funciona | Binários pré-compilados |
| 22.x LTS | ✅ Funciona | Binários pré-compilados |
| 19.x, 21.x, 23.x | ⚠️ Requer ferramentas de build | Sem binários pré-compilados |

### Usando Versões Não-LTS (Windows)

Se você precisa usar uma versão não-LTS (19, 21, 23), instale ferramentas de build primeiro:

**Opção 1: Visual Studio Build Tools**
```powershell
# Baixe e instale de:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Selecione a carga de trabalho "Desktop development with C++"
```

**Opção 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**Opção 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

Veja [guia do node-gyp para Windows](https://github.com/nodejs/node-gyp#on-windows) para mais detalhes.

---

## Ecossistema AgentKits

**AgentKits Memory** faz parte do ecossistema AgentKits da AityTech - ferramentas que tornam assistentes de codificação com IA mais inteligentes.

| Produto | Descrição | Link |
|---------|-----------|------|
| **AgentKits Engineer** | 28 agentes especializados, mais de 100 skills, padrões empresariais | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | Geração de conteúdo de marketing com IA | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | Memória persistente para assistentes de IA (este pacote) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## Histórico de Estrelas

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## Licença

MIT

---

<p align="center">
  <strong>Dê ao seu assistente de IA uma memória que persiste.</strong>
</p>

<p align="center">
  <em>AgentKits Memory por AityTech</em>
</p>

<p align="center">
  Dê uma estrela neste repositório se ele ajuda sua IA a lembrar.
</p>