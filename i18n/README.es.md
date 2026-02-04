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
  <br>
  <img src="https://img.shields.io/badge/tests-970_passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/coverage-91%25-brightgreen" alt="Coverage">
</p>

<p align="center">
  <strong>Sistema de Memoria Persistente para Asistentes de IA en Programación</strong>
</p>

<p align="center">
  Tu asistente de IA olvida todo entre sesiones. AgentKits Memory soluciona eso.<br>
  Decisiones, patrones, errores y contexto — todo persistido localmente vía MCP.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">Sitio Web</a> •
  <a href="https://www.agentkits.net/memory/docs">Documentación</a> •
  <a href="#inicio-rápido">Inicio Rápido</a> •
  <a href="#cómo-funciona">Cómo Funciona</a> •
  <a href="#compatibilidad-multiplataforma">Plataformas</a> •
  <a href="#comandos-cli">CLI</a> •
  <a href="#visor-web">Visor Web</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <strong>Español</strong> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## Características

| Característica | Beneficio |
|---------|---------|
| **100% Local** | Todos los datos permanecen en tu máquina. Sin nube, sin claves API, sin cuentas |
| **Extremadamente Rápido** | SQLite nativo (better-sqlite3) = consultas instantáneas, cero latencia |
| **Configuración Cero** | Funciona desde el primer momento. No requiere configuración de base de datos |
| **Multiplataforma** | Claude Code, Cursor, Windsurf, Cline, OpenCode — un solo comando de configuración |
| **Servidor MCP** | 9 herramientas: guardar, buscar, línea de tiempo, detalles, recordar, listar, actualizar, eliminar, estado |
| **Captura Automática** | Los hooks capturan contexto de sesión, uso de herramientas y resúmenes automáticamente |
| **Enriquecimiento con IA** | Los workers en segundo plano enriquecen observaciones con resúmenes generados por IA |
| **Búsqueda Vectorial** | Similitud semántica HNSW con embeddings multilingües (más de 100 idiomas) |
| **Visor Web** | Interfaz de navegador para ver, buscar, agregar, editar y eliminar memorias |
| **Búsqueda de 3 Capas** | La divulgación progresiva ahorra ~87% de tokens vs obtener todo |
| **Gestión del Ciclo de Vida** | Comprime, archiva y limpia automáticamente sesiones antiguas |
| **Exportar/Importar** | Respalda y restaura memorias como JSON |

---

## Cómo Funciona

```
Sesión 1: "Usar JWT para auth"          Sesión 2: "Agregar endpoint de login"
┌──────────────────────────┐          ┌──────────────────────────┐
│  Programas con IA...     │          │  La IA ya conoce:        │
│  IA toma decisiones      │          │  ✓ Decisión de JWT auth  │
│  IA encuentra errores    │   ───►   │  ✓ Soluciones de errores │
│  IA aprende patrones     │  guardado│  ✓ Patrones de código    │
│                          │          │  ✓ Contexto de sesión    │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% local)
```

1. **Configura una vez** — `npx agentkits-memory-setup` configura tu plataforma
2. **Captura automática** — Los hooks registran decisiones, uso de herramientas y resúmenes mientras trabajas
3. **Inyección de contexto** — La siguiente sesión comienza con historial relevante de sesiones pasadas
4. **Procesamiento en segundo plano** — Los workers enriquecen observaciones con IA, generan embeddings, comprimen datos antiguos
5. **Busca en cualquier momento** — La IA usa herramientas MCP (`memory_search` → `memory_details`) para encontrar contexto pasado

Todos los datos permanecen en `.claude/memory/memory.db` en tu máquina. Sin nube. Sin claves API requeridas.

---

## Decisiones de Diseño que Importan

La mayoría de las herramientas de memoria dispersan datos en archivos markdown, requieren entornos de ejecución de Python o envían tu código a APIs externas. AgentKits Memory toma decisiones fundamentalmente diferentes:

| Decisión de Diseño | Por Qué Importa |
|---------------|----------------|
| **Base de datos SQLite única** | Un archivo (`memory.db`) contiene todo — memorias, sesiones, observaciones, embeddings. Sin archivos dispersos que sincronizar, sin conflictos de fusión, sin datos huérfanos. Respaldo = copiar un archivo |
| **Node.js nativo, cero Python** | Se ejecuta donde sea que se ejecute Node. Sin conda, sin pip, sin virtualenv. El mismo lenguaje que tu servidor MCP — un comando `npx`, listo |
| **Búsqueda de 3 capas eficiente en tokens** | Primero índice de búsqueda (~50 tokens/resultado), luego contexto de línea de tiempo, luego detalles completos. Solo obtén lo que necesitas. Otras herramientas vuelcan archivos de memoria completos en el contexto, quemando tokens en contenido irrelevante |
| **Captura automática vía hooks** | Las decisiones, patrones y errores se registran a medida que ocurren — no después de que recuerdes guardarlos. La inyección de contexto de sesión ocurre automáticamente al inicio de la siguiente sesión |
| **Embeddings locales, sin llamadas API** | La búsqueda vectorial usa un modelo ONNX local (multilingual-e5-small). La búsqueda semántica funciona sin conexión, no cuesta nada y soporta más de 100 idiomas |
| **Workers en segundo plano** | El enriquecimiento con IA, la generación de embeddings y la compresión se ejecutan de forma asíncrona. Tu flujo de codificación nunca se bloquea |
| **Multiplataforma desde el día uno** | Una bandera `--platform=all` configura Claude Code, Cursor, Windsurf, Cline y OpenCode simultáneamente. Misma base de datos de memoria, diferentes editores |
| **Datos de observación estructurados** | El uso de herramientas se captura con clasificación de tipos (lectura/escritura/ejecución/búsqueda), seguimiento de archivos, detección de intención y narrativas generadas por IA — no volcados de texto sin procesar |
| **Sin fugas de procesos** | Los workers en segundo plano se autodestruyen después de 5 minutos, usan archivos de bloqueo basados en PID con limpieza de bloqueos obsoletos y manejan SIGTERM/SIGINT con gracia. Sin procesos zombis, sin workers huérfanos |
| **Sin fugas de memoria** | Los hooks se ejecutan como procesos de corta duración (no demonios de larga ejecución). Las conexiones de base de datos se cierran al apagar. El subproceso de embedding tiene respawn limitado (máx 2), tiempos de espera de solicitudes pendientes y limpieza elegante de todos los temporizadores y colas |

---

## Visor Web

Ver y gestionar tus memorias a través de una interfaz web moderna.

```bash
npx agentkits-memory-web
```

Luego abre **http://localhost:1905** en tu navegador.

### Lista de Sesiones

Explora todas las sesiones con vista de línea de tiempo y detalles de actividad.

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### Lista de Memorias

Explora todas las memorias almacenadas con búsqueda y filtrado por espacio de nombres.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### Agregar Memoria

Crea nuevas memorias con clave, espacio de nombres, tipo, contenido y etiquetas.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### Detalles de Memoria

Ver detalles completos de la memoria con opciones de edición y eliminación.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### Gestionar Embeddings

Genera y gestiona embeddings vectoriales para búsqueda semántica.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## Inicio Rápido

### Opción 1: Marketplace de Plugins de Claude Code (Recomendado para Claude Code)

Instala con un solo comando — sin configuración manual:

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@aitytech
```

Esto instala hooks, servidor MCP y skill de flujo de trabajo de memoria automáticamente. Reinicia Claude Code después de la instalación.

### Opción 2: Configuración Automática (Todas las Plataformas)

```bash
npx agentkits-memory-setup
```

Esto detecta automáticamente tu plataforma y configura todo: servidor MCP, hooks (Claude Code/OpenCode), archivos de reglas (Cursor/Windsurf/Cline), y descarga el modelo de embedding.

**Apuntar a una plataforma específica:**

```bash
npx agentkits-memory-setup --platform=cursor
npx agentkits-memory-setup --platform=windsurf,cline
npx agentkits-memory-setup --platform=all
```

### Opción 3: Configuración Manual de MCP

Si prefieres la configuración manual, agrega a tu configuración MCP:

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

Ubicaciones de archivos de configuración:
- **Claude Code**: `.claude/settings.json` (embebido en la clave `mcpServers`)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (raíz del proyecto)

### 3. Herramientas MCP

Una vez configurado, tu asistente de IA puede usar estas herramientas:

| Herramienta | Descripción |
|------|-------------|
| `memory_status` | Verifica el estado del sistema de memoria (¡llama primero!) |
| `memory_save` | Guarda decisiones, patrones, errores o contexto |
| `memory_search` | **[Paso 1]** Índice de búsqueda — IDs + títulos ligeros (~50 tokens/resultado) |
| `memory_timeline` | **[Paso 2]** Obtén contexto temporal alrededor de una memoria |
| `memory_details` | **[Paso 3]** Obtén contenido completo para IDs específicos |
| `memory_recall` | Vista rápida del tema — resumen agrupado |
| `memory_list` | Lista memorias recientes |
| `memory_update` | Actualiza contenido o etiquetas de memoria existente |
| `memory_delete` | Elimina memorias obsoletas |

---

## Divulgación Progresiva (Búsqueda Eficiente en Tokens)

AgentKits Memory usa un **patrón de búsqueda de 3 capas** que ahorra ~70% de tokens comparado con obtener contenido completo por adelantado.

### Cómo Funciona

```
┌─────────────────────────────────────────────────────────────┐
│  Paso 1: memory_search                                      │
│  Devuelve: IDs, títulos, etiquetas, puntuaciones (~50 tokens/elemento)       │
│  → Revisa el índice, elige memorias relevantes              │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Paso 2: memory_timeline (opcional)                         │
│  Devuelve: Contexto ±30 minutos alrededor de la memoria     │
│  → Comprende qué sucedió antes/después                      │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Paso 3: memory_details                                     │
│  Devuelve: Contenido completo solo para IDs seleccionados   │
│  → Obtén solo lo que realmente necesitas                    │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de Trabajo de Ejemplo

```typescript
// Paso 1: Buscar - obtener índice ligero
memory_search({ query: "authentication" })
// → Devuelve: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// Paso 2: (Opcional) Ver contexto temporal
memory_timeline({ anchor: "abc" })
// → Devuelve: Qué sucedió antes/después de esta memoria

// Paso 3: Obtener contenido completo solo para lo que necesitas
memory_details({ ids: ["abc"] })
// → Devuelve: Contenido completo para la memoria seleccionada
```

### Ahorro de Tokens

| Enfoque | Tokens Usados |
|----------|-------------|
| **Antiguo:** Obtener todo el contenido | ~500 tokens × 10 resultados = 5000 tokens |
| **Nuevo:** Divulgación progresiva | 50 × 10 + 500 × 2 = 1500 tokens |
| **Ahorro** | **Reducción del 70%** |

---

## Comandos CLI

```bash
# Configuración con un comando (detecta automáticamente la plataforma)
npx agentkits-memory-setup
npx agentkits-memory-setup --platform=cursor      # plataforma específica
npx agentkits-memory-setup --platform=all          # todas las plataformas
npx agentkits-memory-setup --force                 # reinstalar/actualizar

# Iniciar servidor MCP
npx agentkits-memory-server

# Visor web (puerto 1905)
npx agentkits-memory-web

# Visor de terminal
npx agentkits-memory-viewer
npx agentkits-memory-viewer --stats                # estadísticas de base de datos
npx agentkits-memory-viewer --json                 # salida JSON

# Guardar desde CLI
npx agentkits-memory-save "Use JWT with refresh tokens" --category pattern --tags auth,security

# Configuración
npx agentkits-memory-hook settings .               # ver configuración actual
npx agentkits-memory-hook settings . --reset       # restablecer a valores predeterminados
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# Exportar / Importar
npx agentkits-memory-hook export . my-project ./backup.json
npx agentkits-memory-hook import . ./backup.json

# Gestión del ciclo de vida
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

// Almacenar una memoria
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// Consultar memorias
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// Obtener por clave
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## Hooks de Captura Automática

Los hooks capturan automáticamente tus sesiones de codificación con IA (solo Claude Code y OpenCode):

| Hook | Disparador | Acción |
|------|---------|--------|
| `context` | Inicio de Sesión | Inyecta contexto de sesión anterior + estado de memoria |
| `session-init` | Prompt del Usuario | Inicializa/reanuda sesión, registra prompts |
| `observation` | Después del Uso de Herramienta | Captura uso de herramienta con detección de intención |
| `summarize` | Fin de Sesión | Genera resumen estructurado de sesión |
| `user-message` | Inicio de Sesión | Muestra estado de memoria al usuario (stderr) |

Configurar hooks:
```bash
npx agentkits-memory-setup
```

**Lo que se captura automáticamente:**
- Lecturas/escrituras de archivos con rutas
- Cambios de código como diffs estructurados (antes → después)
- Intención del desarrollador (corrección de errores, característica, refactorización, investigación, etc.)
- Resúmenes de sesión con decisiones, errores y próximos pasos
- Seguimiento de múltiples prompts dentro de sesiones

---

## Compatibilidad Multiplataforma

| Plataforma | MCP | Hooks | Archivo de Reglas | Configuración |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ Completo | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ Completo | — | `--platform=opencode` |

- **Servidor MCP** funciona con todas las plataformas (herramientas de memoria vía protocolo MCP)
- **Hooks** proporcionan captura automática en Claude Code y OpenCode
- **Archivos de reglas** enseñan a Cursor/Windsurf/Cline el flujo de trabajo de memoria
- **Datos de memoria** siempre almacenados en `.claude/memory/` (única fuente de verdad)

---

## Workers en Segundo Plano

Después de cada sesión, los workers en segundo plano procesan tareas en cola:

| Worker | Tarea | Descripción |
|--------|------|-------------|
| `embed-session` | Embeddings | Genera embeddings vectoriales para búsqueda semántica |
| `enrich-session` | Enriquecimiento con IA | Enriquece observaciones con resúmenes, hechos y conceptos generados por IA |
| `compress-session` | Compresión | Comprime observaciones antiguas (10:1–25:1) y genera resúmenes de sesión (20:1–100:1) |

Los workers se ejecutan automáticamente después del fin de la sesión. Cada worker:
- Procesa hasta 200 elementos por ejecución
- Usa archivos de bloqueo para prevenir ejecución concurrente
- Se autodestruye después de 5 minutos (previene zombis)
- Reintenta tareas fallidas hasta 3 veces

---

## Configuración del Proveedor de IA

El enriquecimiento con IA usa proveedores conectables. El predeterminado es `claude-cli` (no se necesita clave API).

| Proveedor | Tipo | Modelo Predeterminado | Notas |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | Usa `claude --print`, no se necesita clave API |
| **OpenAI** | `openai` | `gpt-4o-mini` | Cualquier modelo OpenAI |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Clave de Google AI Studio |
| **OpenRouter** | `openai` | cualquiera | Establece `baseUrl` a `https://openrouter.ai/api/v1` |
| **GLM (Zhipu)** | `openai` | cualquiera | Establece `baseUrl` a `https://open.bigmodel.cn/api/paas/v4` |
| **Ollama** | `openai` | cualquiera | Establece `baseUrl` a `http://localhost:11434/v1` |

### Opción 1: Variables de Entorno

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (usa formato compatible con OpenAI)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# Ollama local (no se necesita clave API)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# Deshabilitar enriquecimiento con IA por completo
export AGENTKITS_AI_ENRICHMENT=false
```

### Opción 2: Configuración Persistente

```bash
# Guardado en .claude/memory/settings.json — persiste entre sesiones
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx agentkits-memory-hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx agentkits-memory-hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# Ver configuración actual
npx agentkits-memory-hook settings .

# Restablecer a valores predeterminados
npx agentkits-memory-hook settings . --reset
```

> **Prioridad:** Las variables de entorno anulan settings.json. Settings.json anula los valores predeterminados.

---

## Gestión del Ciclo de Vida

Gestiona el crecimiento de la memoria a lo largo del tiempo:

```bash
# Comprimir observaciones más antiguas de 7 días, archivar sesiones más antiguas de 30 días
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30

# También eliminar automáticamente sesiones archivadas más antiguas de 90 días
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# Ver estadísticas del ciclo de vida
npx agentkits-memory-hook lifecycle-stats .
```

| Etapa | Qué Sucede |
|-------|-------------|
| **Comprimir** | Comprime con IA las observaciones, genera resúmenes de sesión |
| **Archivar** | Marca sesiones antiguas como archivadas (excluidas del contexto) |
| **Eliminar** | Elimina sesiones archivadas (opt-in, requiere `--delete`) |

---

## Exportar / Importar

Respalda y restaura las memorias de tu proyecto:

```bash
# Exportar todas las sesiones para un proyecto
npx agentkits-memory-hook export . my-project ./backup.json

# Importar desde respaldo (deduplica automáticamente)
npx agentkits-memory-hook import . ./backup.json
```

El formato de exportación incluye sesiones, observaciones, prompts y resúmenes.

---

## Categorías de Memoria

| Categoría | Caso de Uso |
|----------|----------|
| `decision` | Decisiones de arquitectura, elecciones de stack tecnológico, compromisos |
| `pattern` | Convenciones de codificación, patrones de proyecto, enfoques recurrentes |
| `error` | Correcciones de errores, soluciones de errores, insights de depuración |
| `context` | Antecedentes del proyecto, convenciones del equipo, configuración del entorno |
| `observation` | Observaciones de sesión capturadas automáticamente |

---

## Almacenamiento

Las memorias se almacenan en `.claude/memory/` dentro del directorio de tu proyecto.

```
.claude/memory/
├── memory.db          # Base de datos SQLite (todos los datos)
├── memory.db-wal      # Registro write-ahead (temporal)
├── settings.json      # Configuración persistente (proveedor de IA, config de contexto)
└── embeddings-cache/  # Embeddings vectoriales en caché
```

---

## Soporte para Idiomas CJK

AgentKits Memory tiene **soporte automático para CJK** para búsqueda de texto en chino, japonés y coreano.

### Configuración Cero

Cuando `better-sqlite3` está instalado (predeterminado), la búsqueda CJK funciona automáticamente:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// Almacenar contenido CJK
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// Buscar en japonés, chino o coreano - ¡simplemente funciona!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### Cómo Funciona

- **SQLite nativo**: Usa `better-sqlite3` para máximo rendimiento
- **Tokenizador de trigramas**: FTS5 con trigramas crea secuencias de 3 caracteres para coincidencia CJK
- **Respaldo inteligente**: Consultas CJK cortas (< 3 caracteres) usan automáticamente búsqueda LIKE
- **Clasificación BM25**: Puntuación de relevancia para resultados de búsqueda

### Avanzado: Segmentación de Palabras en Japonés

Para japonés avanzado con segmentación de palabras adecuada, opcionalmente usa lindera:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

Requiere compilación de [lindera-sqlite](https://github.com/lindera/lindera-sqlite).

---

## Referencia de API

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // Predeterminado: '.claude/memory'
  dbFilename: string;           // Predeterminado: 'memory.db'
  enableVectorIndex: boolean;   // Predeterminado: false
  dimensions: number;           // Predeterminado: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // Predeterminado: true
  cacheSize: number;            // Predeterminado: 1000
  cacheTtl: number;             // Predeterminado: 300000 (5 min)
}
```

### Métodos

| Método | Descripción |
|--------|-------------|
| `initialize()` | Inicializar el servicio de memoria |
| `shutdown()` | Apagar y persistir cambios |
| `storeEntry(input)` | Almacenar una entrada de memoria |
| `get(id)` | Obtener entrada por ID |
| `getByKey(namespace, key)` | Obtener entrada por espacio de nombres y clave |
| `update(id, update)` | Actualizar una entrada |
| `delete(id)` | Eliminar una entrada |
| `query(query)` | Consultar entradas con filtros |
| `semanticSearch(content, k)` | Búsqueda de similitud semántica |
| `count(namespace?)` | Contar entradas |
| `listNamespaces()` | Listar todos los espacios de nombres |
| `getStats()` | Obtener estadísticas |

---

## Calidad del Código

AgentKits Memory está exhaustivamente probado con **970 tests unitarios** en 21 suites de test.

| Métrica | Cobertura |
|---------|-----------|
| **Sentencias** | 90.29% |
| **Ramas** | 80.85% |
| **Funciones** | 90.54% |
| **Líneas** | 91.74% |

### Categorías de Tests

| Categoría | Tests | Cobertura |
|-----------|-------|-----------|
| Servicio de Memoria Core | 56 | CRUD, búsqueda, paginación, categorías, tags, importar/exportar |
| Backend SQLite | 65 | Schema, migraciones, FTS5, transacciones, manejo de errores |
| Índice Vectorial HNSW | 47 | Inserción, búsqueda, eliminación, persistencia, casos límite |
| Búsqueda Híbrida | 44 | FTS + fusión vectorial, puntuación, ranking, filtros |
| Economía de Tokens | 27 | Presupuestos de búsqueda 3 capas, truncamiento, optimización |
| Sistema de Embeddings | 63 | Caché, subprocesos, modelos locales, soporte CJK |
| Sistema de Hooks | 502 | Contexto, init de sesión, observación, resumen, enriquecimiento IA, ciclo de vida, workers, adaptadores, tipos |
| Servidor MCP | 48 | 9 herramientas MCP, validación, respuestas de error |
| CLI | 34 | Detección de plataforma, generación de reglas |
| Integración | 84 | Flujos end-to-end, integración de embeddings, multi-sesión |

```bash
# Ejecutar tests
npm test

# Ejecutar con cobertura
npm run test:coverage
```

---

## Requisitos

- **Node.js LTS**: 18.x, 20.x o 22.x (recomendado)
- Asistente de codificación con IA compatible con MCP

### Notas sobre la Versión de Node.js

Este paquete usa `better-sqlite3` que requiere binarios nativos. **Los binarios precompilados están disponibles solo para versiones LTS**.

| Versión de Node | Estado | Notas |
|--------------|--------|-------|
| 18.x LTS | ✅ Funciona | Binarios precompilados |
| 20.x LTS | ✅ Funciona | Binarios precompilados |
| 22.x LTS | ✅ Funciona | Binarios precompilados |
| 19.x, 21.x, 23.x | ⚠️ Requiere herramientas de compilación | Sin binarios precompilados |

### Uso de Versiones No-LTS (Windows)

Si debes usar una versión no-LTS (19, 21, 23), instala primero las herramientas de compilación:

**Opción 1: Visual Studio Build Tools**
```powershell
# Descarga e instala desde:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Selecciona la carga de trabajo "Desarrollo de escritorio con C++"
```

**Opción 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**Opción 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

Consulta la [guía de node-gyp para Windows](https://github.com/nodejs/node-gyp#on-windows) para más detalles.

---

## Ecosistema AgentKits

**AgentKits Memory** es parte del ecosistema AgentKits de AityTech - herramientas que hacen más inteligentes a los asistentes de codificación con IA.

| Producto | Descripción | Enlace |
|---------|-------------|------|
| **AgentKits Engineer** | 28 agentes especializados, más de 100 skills, patrones empresariales | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | Generación de contenido de marketing impulsada por IA | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | Memoria persistente para asistentes de IA (este paquete) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## Historial de Estrellas

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## Licencia

MIT

---

<p align="center">
  <strong>Dale a tu asistente de IA memoria que persiste.</strong>
</p>

<p align="center">
  <em>AgentKits Memory por AityTech</em>
</p>

<p align="center">
  Marca con estrella este repositorio si te ayuda a que tu IA recuerde.
</p>