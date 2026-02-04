<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>от <strong>AityTech</strong></em>
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
  <strong>Система постоянной памяти для AI-ассистентов программирования</strong>
</p>

<p align="center">
  Ваш AI-ассистент забывает всё между сеансами. AgentKits Memory решает эту проблему.<br>
  Решения, паттерны, ошибки и контекст — всё сохраняется локально через MCP.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">Сайт</a> •
  <a href="https://www.agentkits.net/memory/docs">Документация</a> •
  <a href="#быстрый-старт">Быстрый старт</a> •
  <a href="#как-это-работает">Как это работает</a> •
  <a href="#мультиплатформенная-поддержка">Платформы</a> •
  <a href="#cli-команды">CLI</a> •
  <a href="#веб-интерфейс">Веб-интерфейс</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <strong>Русский</strong> · <a href="./README.ar.md">العربية</a>
</p>

---

## Возможности

| Возможность | Преимущество |
|---------|---------|
| **100% локально** | Все данные остаются на вашей машине. Без облака, без API-ключей, без аккаунтов |
| **Молниеносная скорость** | Нативный SQLite (better-sqlite3) = мгновенные запросы, нулевая задержка |
| **Без настройки** | Работает из коробки. Не требуется настройка базы данных |
| **Мультиплатформенность** | Claude Code, Cursor, Windsurf, Cline, OpenCode — одна команда установки |
| **MCP-сервер** | 9 инструментов: сохранение, поиск, временная шкала, детали, извлечение, список, обновление, удаление, статус |
| **Автозахват** | Хуки автоматически фиксируют контекст сеанса, использование инструментов, сводки |
| **AI-обогащение** | Фоновые процессы обогащают наблюдения сводками, сгенерированными AI |
| **Векторный поиск** | HNSW семантическое сходство с многоязычными эмбеддингами (100+ языков) |
| **Веб-интерфейс** | Браузерный UI для просмотра, поиска, добавления, редактирования, удаления воспоминаний |
| **3-уровневый поиск** | Прогрессивное раскрытие экономит ~87% токенов по сравнению с загрузкой всего |
| **Управление жизненным циклом** | Автосжатие, архивация и очистка старых сеансов |
| **Экспорт/импорт** | Резервное копирование и восстановление воспоминаний в формате JSON |

---

## Как это работает

```
Сеанс 1: "Использовать JWT для auth"   Сеанс 2: "Добавить endpoint входа"
┌──────────────────────────┐          ┌──────────────────────────┐
│  Вы кодите с AI...       │          │  AI уже знает:           │
│  AI принимает решения    │          │  ✓ Решение о JWT auth    │
│  AI сталкивается с       │   ───►   │  ✓ Решения ошибок        │
│    ошибками              │  сохран. │  ✓ Паттерны кода         │
│  AI изучает паттерны     │          │  ✓ Контекст сеанса       │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% локально)
```

1. **Настройка один раз** — `npx agentkits-memory-setup` настраивает вашу платформу
2. **Автозахват** — Хуки записывают решения, использование инструментов и сводки во время работы
3. **Внедрение контекста** — Следующий сеанс начинается с релевантной историей из прошлых сеансов
4. **Фоновая обработка** — Процессы обогащают наблюдения с помощью AI, генерируют эмбеддинги, сжимают старые данные
5. **Поиск в любое время** — AI использует MCP-инструменты (`memory_search` → `memory_details`) для поиска прошлого контекста

Все данные остаются в `.claude/memory/memory.db` на вашей машине. Без облака. API-ключи не требуются.

---

## Проектные решения, которые имеют значение

Большинство инструментов памяти рассеивают данные по markdown-файлам, требуют Python runtime или отправляют ваш код внешним API. AgentKits Memory делает принципиально другой выбор:

| Проектное решение | Почему это важно |
|---------------|----------------|
| **Единая база данных SQLite** | Один файл (`memory.db`) содержит всё — воспоминания, сеансы, наблюдения, эмбеддинги. Никаких рассеянных файлов для синхронизации, конфликтов слияния, потерянных данных. Резервная копия = копирование одного файла |
| **Нативный Node.js, без Python** | Работает везде, где работает Node. Без conda, без pip, без virtualenv. Тот же язык, что и ваш MCP-сервер — одна команда `npx`, готово |
| **Токен-эффективный 3-уровневый поиск** | Сначала индекс поиска (~50 токенов/результат), затем контекст временной шкалы, затем полные детали. Загружайте только то, что нужно. Другие инструменты сбрасывают целые файлы памяти в контекст, сжигая токены на нерелевантном контенте |
| **Автозахват через хуки** | Решения, паттерны и ошибки записываются по мере их появления — а не после того, как вы вспомните их сохранить. Внедрение контекста сеанса происходит автоматически при следующем старте сеанса |
| **Локальные эмбеддинги, без API-вызовов** | Векторный поиск использует локальную ONNX-модель (multilingual-e5-small). Семантический поиск работает офлайн, ничего не стоит и поддерживает 100+ языков |
| **Фоновые процессы** | AI-обогащение, генерация эмбеддингов и сжатие выполняются асинхронно. Ваш процесс кодирования никогда не блокируется |
| **Мультиплатформенность с первого дня** | Один флаг `--platform=all` настраивает Claude Code, Cursor, Windsurf, Cline и OpenCode одновременно. Та же база данных памяти, разные редакторы |
| **Структурированные данные наблюдений** | Использование инструментов фиксируется с классификацией типов (read/write/execute/search), отслеживанием файлов, определением намерений и AI-генерируемыми описаниями — а не сырыми текстовыми дампами |
| **Без утечек процессов** | Фоновые процессы самостоятельно завершаются через 5 минут, используют PID-файлы блокировок с очисткой устаревших блокировок и корректно обрабатывают SIGTERM/SIGINT. Никаких процессов-зомби, никаких осиротевших процессов |
| **Без утечек памяти** | Хуки работают как короткоживущие процессы (не долгоживущие демоны). Соединения с базой данных закрываются при выключении. Подпроцесс эмбеддингов имеет ограниченный перезапуск (макс. 2), таймауты ожидающих запросов и корректную очистку всех таймеров и очередей |

---

## Веб-интерфейс

Просматривайте и управляйте своими воспоминаниями через современный веб-интерфейс.

```bash
npx agentkits-memory-web
```

Затем откройте **http://localhost:1905** в браузере.

### Список сеансов

Просмотр всех сеансов с хронологией и деталями активности.

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### Список воспоминаний

Просмотр всех сохранённых воспоминаний с поиском и фильтрацией по пространству имён.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### Добавление воспоминания

Создание новых воспоминаний с ключом, пространством имён, типом, содержимым и тегами.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### Детали воспоминания

Просмотр полных деталей воспоминания с возможностью редактирования и удаления.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### Управление эмбеддингами

Генерация и управление векторными эмбеддингами для семантического поиска.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## Быстрый старт

### Вариант 1: Маркетплейс плагинов Claude Code (рекомендуется для Claude Code)

Установка одной командой — без ручной настройки:

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@aitytech
```

Это автоматически устанавливает хуки, MCP-сервер и навык рабочего процесса памяти. Перезапустите Claude Code после установки.

### Вариант 2: Автоматическая установка (все платформы)

```bash
npx agentkits-memory-setup
```

Это автоматически определяет вашу платформу и настраивает всё: MCP-сервер, хуки (Claude Code/OpenCode), файлы правил (Cursor/Windsurf/Cline) и загружает модель эмбеддингов.

**Настройка для конкретной платформы:**

```bash
npx agentkits-memory-setup --platform=cursor
npx agentkits-memory-setup --platform=windsurf,cline
npx agentkits-memory-setup --platform=all
```

### Вариант 3: Ручная настройка MCP

Если вы предпочитаете ручную настройку, добавьте в ваш MCP-конфиг:

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

Расположение конфигурационных файлов:
- **Claude Code**: `.claude/settings.json` (встроен в ключ `mcpServers`)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (корень проекта)

### 3. MCP-инструменты

После настройки ваш AI-ассистент может использовать эти инструменты:

| Инструмент | Описание |
|------|-------------|
| `memory_status` | Проверка статуса системы памяти (вызывайте первым!) |
| `memory_save` | Сохранение решений, паттернов, ошибок или контекста |
| `memory_search` | **[Шаг 1]** Поиск по индексу — легковесные ID + заголовки (~50 токенов/результат) |
| `memory_timeline` | **[Шаг 2]** Получение временного контекста вокруг воспоминания |
| `memory_details` | **[Шаг 3]** Получение полного содержимого для конкретных ID |
| `memory_recall` | Быстрый обзор темы — сгруппированная сводка |
| `memory_list` | Список недавних воспоминаний |
| `memory_update` | Обновление существующего содержимого воспоминания или тегов |
| `memory_delete` | Удаление устаревших воспоминаний |

---

## Прогрессивное раскрытие (токен-эффективный поиск)

AgentKits Memory использует **шаблон 3-уровневого поиска**, который экономит ~70% токенов по сравнению с предварительной загрузкой полного содержимого.

### Как это работает

```
┌─────────────────────────────────────────────────────────────┐
│  Шаг 1: memory_search                                       │
│  Возвращает: ID, заголовки, теги, оценки (~50 токенов/элемент) │
│  → Просмотр индекса, выбор релевантных воспоминаний         │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Шаг 2: memory_timeline (опционально)                       │
│  Возвращает: Контекст ±30 минут вокруг воспоминания         │
│  → Понимание того, что произошло до/после                   │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Шаг 3: memory_details                                      │
│  Возвращает: Полное содержимое только для выбранных ID      │
│  → Загрузка только того, что действительно нужно            │
└─────────────────────────────────────────────────────────────┘
```

### Пример рабочего процесса

```typescript
// Шаг 1: Поиск - получение легковесного индекса
memory_search({ query: "authentication" })
// → Возвращает: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// Шаг 2: (Опционально) Просмотр временного контекста
memory_timeline({ anchor: "abc" })
// → Возвращает: Что произошло до/после этого воспоминания

// Шаг 3: Получение полного содержимого только для того, что нужно
memory_details({ ids: ["abc"] })
// → Возвращает: Полное содержимое для выбранного воспоминания
```

### Экономия токенов

| Подход | Использовано токенов |
|----------|-------------|
| **Старый:** Загрузка всего содержимого | ~500 токенов × 10 результатов = 5000 токенов |
| **Новый:** Прогрессивное раскрытие | 50 × 10 + 500 × 2 = 1500 токенов |
| **Экономия** | **Снижение на 70%** |

---

## CLI-команды

```bash
# Установка одной командой (автоопределение платформы)
npx agentkits-memory-setup
npx agentkits-memory-setup --platform=cursor      # конкретная платформа
npx agentkits-memory-setup --platform=all          # все платформы
npx agentkits-memory-setup --force                 # переустановка/обновление

# Запуск MCP-сервера
npx agentkits-memory-server

# Веб-интерфейс (порт 1905)
npx agentkits-memory-web

# Терминальный просмотрщик
npx agentkits-memory-viewer
npx agentkits-memory-viewer --stats                # статистика базы данных
npx agentkits-memory-viewer --json                 # вывод в JSON

# Сохранение из CLI
npx agentkits-memory-save "Use JWT with refresh tokens" --category pattern --tags auth,security

# Настройки
npx agentkits-memory-hook settings .               # просмотр текущих настроек
npx agentkits-memory-hook settings . --reset       # сброс до значений по умолчанию
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# Экспорт / Импорт
npx agentkits-memory-hook export . my-project ./backup.json
npx agentkits-memory-hook import . ./backup.json

# Управление жизненным циклом
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30
npx agentkits-memory-hook lifecycle-stats .
```

---

## Программное использование

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// Сохранение воспоминания
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// Запрос воспоминаний
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// Получение по ключу
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## Хуки автозахвата

Хуки автоматически фиксируют ваши AI-сеансы программирования (только Claude Code и OpenCode):

| Хук | Триггер | Действие |
|------|---------|--------|
| `context` | Начало сеанса | Внедряет контекст предыдущего сеанса + статус памяти |
| `session-init` | Запрос пользователя | Инициализирует/возобновляет сеанс, записывает запросы |
| `observation` | После использования инструмента | Фиксирует использование инструмента с определением намерения |
| `summarize` | Конец сеанса | Генерирует структурированную сводку сеанса |
| `user-message` | Начало сеанса | Отображает статус памяти пользователю (stderr) |

Установка хуков:
```bash
npx agentkits-memory-setup
```

**Что фиксируется автоматически:**
- Чтение/запись файлов с путями
- Изменения кода в виде структурированных diff (до → после)
- Намерение разработчика (исправление ошибок, функция, рефакторинг, исследование и т.д.)
- Сводки сеансов с решениями, ошибками и следующими шагами
- Отслеживание нескольких запросов в рамках сеансов

---

## Мультиплатформенная поддержка

| Платформа | MCP | Хуки | Файл правил | Установка |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ Полная | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ Полная | — | `--platform=opencode` |

- **MCP-сервер** работает со всеми платформами (инструменты памяти через MCP-протокол)
- **Хуки** обеспечивают автозахват в Claude Code и OpenCode
- **Файлы правил** обучают Cursor/Windsurf/Cline рабочему процессу памяти
- **Данные памяти** всегда хранятся в `.claude/memory/` (единый источник истины)

---

## Фоновые процессы

После каждого сеанса фоновые процессы обрабатывают задачи в очереди:

| Процесс | Задача | Описание |
|--------|------|-------------|
| `embed-session` | Эмбеддинги | Генерация векторных эмбеддингов для семантического поиска |
| `enrich-session` | AI-обогащение | Обогащение наблюдений AI-генерируемыми сводками, фактами, концепциями |
| `compress-session` | Сжатие | Сжатие старых наблюдений (10:1–25:1) и генерация дайджестов сеансов (20:1–100:1) |

Процессы запускаются автоматически после окончания сеанса. Каждый процесс:
- Обрабатывает до 200 элементов за запуск
- Использует файлы блокировок для предотвращения параллельного выполнения
- Автозавершается через 5 минут (предотвращает зомби)
- Повторяет неудачные задачи до 3 раз

---

## Настройка AI-провайдера

AI-обогащение использует подключаемые провайдеры. По умолчанию используется `claude-cli` (API-ключ не нужен).

| Провайдер | Тип | Модель по умолчанию | Примечания |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | Использует `claude --print`, API-ключ не нужен |
| **OpenAI** | `openai` | `gpt-4o-mini` | Любая модель OpenAI |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Ключ Google AI Studio |
| **OpenRouter** | `openai` | любая | Установите `baseUrl` в `https://openrouter.ai/api/v1` |
| **GLM (Zhipu)** | `openai` | любая | Установите `baseUrl` в `https://open.bigmodel.cn/api/paas/v4` |
| **Ollama** | `openai` | любая | Установите `baseUrl` в `http://localhost:11434/v1` |

### Вариант 1: Переменные окружения

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (использует OpenAI-совместимый формат)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# Локальный Ollama (API-ключ не нужен)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# Полностью отключить AI-обогащение
export AGENTKITS_AI_ENRICHMENT=false
```

### Вариант 2: Постоянные настройки

```bash
# Сохраняется в .claude/memory/settings.json — сохраняется между сеансами
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx agentkits-memory-hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx agentkits-memory-hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# Просмотр текущих настроек
npx agentkits-memory-hook settings .

# Сброс до значений по умолчанию
npx agentkits-memory-hook settings . --reset
```

> **Приоритет:** Переменные окружения переопределяют settings.json. Settings.json переопределяет значения по умолчанию.

---

## Управление жизненным циклом

Управление ростом памяти с течением времени:

```bash
# Сжать наблюдения старше 7 дней, архивировать сеансы старше 30 дней
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30

# Также автоудаление архивированных сеансов старше 90 дней
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# Просмотр статистики жизненного цикла
npx agentkits-memory-hook lifecycle-stats .
```

| Стадия | Что происходит |
|-------|-------------|
| **Сжатие** | AI-сжатие наблюдений, генерация дайджестов сеансов |
| **Архивация** | Отметка старых сеансов как архивированных (исключены из контекста) |
| **Удаление** | Удаление архивированных сеансов (opt-in, требует `--delete`) |

---

## Экспорт / Импорт

Резервное копирование и восстановление воспоминаний вашего проекта:

```bash
# Экспорт всех сеансов для проекта
npx agentkits-memory-hook export . my-project ./backup.json

# Импорт из резервной копии (автоматическая дедупликация)
npx agentkits-memory-hook import . ./backup.json
```

Формат экспорта включает сеансы, наблюдения, запросы и сводки.

---

## Категории воспоминаний

| Категория | Случай использования |
|----------|----------|
| `decision` | Архитектурные решения, выбор технологий, компромиссы |
| `pattern` | Соглашения о кодировании, паттерны проекта, повторяющиеся подходы |
| `error` | Исправления ошибок, решения ошибок, инсайты отладки |
| `context` | Фон проекта, командные соглашения, настройка окружения |
| `observation` | Автозахваченные наблюдения сеанса |

---

## Хранение

Воспоминания хранятся в `.claude/memory/` внутри директории вашего проекта.

```
.claude/memory/
├── memory.db          # База данных SQLite (все данные)
├── memory.db-wal      # Write-ahead log (временный)
├── settings.json      # Постоянные настройки (AI-провайдер, конфиг контекста)
└── embeddings-cache/  # Кешированные векторные эмбеддинги
```

---

## Поддержка CJK-языков

AgentKits Memory имеет **автоматическую поддержку CJK** для поиска текста на китайском, японском и корейском языках.

### Без настройки

Когда установлен `better-sqlite3` (по умолчанию), поиск CJK работает автоматически:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// Сохранение CJK-содержимого
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// Поиск на японском, китайском или корейском - просто работает!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### Как это работает

- **Нативный SQLite**: Использует `better-sqlite3` для максимальной производительности
- **Триграммный токенизатор**: FTS5 с триграммами создаёт 3-символьные последовательности для CJK-сопоставления
- **Умный откат**: Короткие CJK-запросы (< 3 символов) автоматически используют LIKE-поиск
- **BM25-ранжирование**: Оценка релевантности для результатов поиска

### Дополнительно: Сегментация японских слов

Для продвинутого японского с правильной сегментацией слов, опционально используйте lindera:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

Требуется сборка [lindera-sqlite](https://github.com/lindera/lindera-sqlite).

---

## Справочник API

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // По умолчанию: '.claude/memory'
  dbFilename: string;           // По умолчанию: 'memory.db'
  enableVectorIndex: boolean;   // По умолчанию: false
  dimensions: number;           // По умолчанию: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // По умолчанию: true
  cacheSize: number;            // По умолчанию: 1000
  cacheTtl: number;             // По умолчанию: 300000 (5 мин)
}
```

### Методы

| Метод | Описание |
|--------|-------------|
| `initialize()` | Инициализация сервиса памяти |
| `shutdown()` | Выключение и сохранение изменений |
| `storeEntry(input)` | Сохранение записи воспоминания |
| `get(id)` | Получение записи по ID |
| `getByKey(namespace, key)` | Получение записи по пространству имён и ключу |
| `update(id, update)` | Обновление записи |
| `delete(id)` | Удаление записи |
| `query(query)` | Запрос записей с фильтрами |
| `semanticSearch(content, k)` | Поиск по семантическому сходству |
| `count(namespace?)` | Подсчёт записей |
| `listNamespaces()` | Список всех пространств имён |
| `getStats()` | Получение статистики |

---

## Качество кода

AgentKits Memory тщательно протестирован — **970 модульных тестов** в 21 тестовом наборе.

| Метрика | Покрытие |
|---------|----------|
| **Операторы** | 90.29% |
| **Ветви** | 80.85% |
| **Функции** | 90.54% |
| **Строки** | 91.74% |

### Категории тестов

| Категория | Тестов | Что покрывает |
|-----------|--------|---------------|
| Основной сервис памяти | 56 | CRUD, поиск, пагинация, категории, теги, импорт/экспорт |
| Backend SQLite | 65 | Схема, миграции, FTS5, транзакции, обработка ошибок |
| Векторный индекс HNSW | 47 | Вставка, поиск, удаление, персистентность, граничные случаи |
| Гибридный поиск | 44 | FTS + векторное слияние, скоринг, ранжирование, фильтры |
| Экономика токенов | 27 | Бюджеты 3-уровневого поиска, усечение, оптимизация |
| Система эмбеддингов | 63 | Кеш, подпроцесс, локальные модели, поддержка CJK |
| Система хуков | 502 | Контекст, инициализация сессии, наблюдение, резюме, AI-обогащение, жизненный цикл, воркеры очередей, адаптеры, типы |
| MCP-сервер | 48 | Все 9 MCP-инструментов, валидация, ответы об ошибках |
| CLI | 34 | Определение платформы, генерация правил |
| Интеграция | 84 | Сквозные потоки, интеграция эмбеддингов, мультисессии |

```bash
# Запуск тестов
npm test

# Запуск с покрытием
npm run test:coverage
```

---

## Требования

- **Node.js LTS**: 18.x, 20.x или 22.x (рекомендуется)
- MCP-совместимый AI-ассистент программирования

### Примечания к версиям Node.js

Этот пакет использует `better-sqlite3`, который требует нативных бинарных файлов. **Предсобранные бинарные файлы доступны только для LTS-версий**.

| Версия Node | Статус | Примечания |
|--------------|--------|-------|
| 18.x LTS | ✅ Работает | Предсобранные бинарные файлы |
| 20.x LTS | ✅ Работает | Предсобранные бинарные файлы |
| 22.x LTS | ✅ Работает | Предсобранные бинарные файлы |
| 19.x, 21.x, 23.x | ⚠️ Требуются инструменты сборки | Нет предсобранных бинарных файлов |

### Использование не-LTS версий (Windows)

Если вы должны использовать не-LTS версию (19, 21, 23), сначала установите инструменты сборки:

**Вариант 1: Visual Studio Build Tools**
```powershell
# Скачайте и установите с:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Выберите рабочую нагрузку "Desktop development with C++"
```

**Вариант 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**Вариант 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

См. [руководство node-gyp для Windows](https://github.com/nodejs/node-gyp#on-windows) для более подробной информации.

---

## Экосистема AgentKits

**AgentKits Memory** является частью экосистемы AgentKits от AityTech — инструменты, которые делают AI-ассистентов программирования умнее.

| Продукт | Описание | Ссылка |
|---------|-------------|------|
| **AgentKits Engineer** | 28 специализированных агентов, 100+ навыков, корпоративные паттерны | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | AI-генерация маркетингового контента | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | Постоянная память для AI-ассистентов (этот пакет) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## История звёзд

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## Лицензия

MIT

---

<p align="center">
  <strong>Дайте вашему AI-ассистенту память, которая сохраняется.</strong>
</p>

<p align="center">
  <em>AgentKits Memory от AityTech</em>
</p>

<p align="center">
  Поставьте звезду этому репозиторию, если он помогает вашему AI запоминать.
</p>