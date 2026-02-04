<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>由 <strong>AityTech</strong> 出品</em>
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
  <strong>AI 编程助手的持久化记忆系统</strong>
</p>

<p align="center">
  你的 AI 助手在会话之间会忘记所有内容。AgentKits Memory 解决了这个问题。<br>
  决策、模式、错误和上下文 — 全部通过 MCP 在本地持久化保存。
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">网站</a> •
  <a href="https://www.agentkits.net/memory/docs">文档</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#工作原理">工作原理</a> •
  <a href="#多平台支持">平台</a> •
  <a href="#cli-命令">CLI</a> •
  <a href="#web-查看器">Web 查看器</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## 功能特性

| 功能 | 优势 |
|---------|---------|
| **100% 本地化** | 所有数据保存在你的机器上。无云端、无 API 密钥、无需注册账户 |
| **极速响应** | 原生 SQLite (better-sqlite3) = 即时查询、零延迟 |
| **零配置** | 开箱即用。无需数据库设置 |
| **多平台支持** | Claude Code、Cursor、Windsurf、Cline、OpenCode — 一条命令完成设置 |
| **MCP 服务器** | 9 个工具：保存、搜索、时间线、详情、回忆、列表、更新、删除、状态 |
| **自动捕获** | 钩子自动捕获会话上下文、工具使用情况、摘要 |
| **AI 增强** | 后台工作进程使用 AI 生成的摘要来增强观察记录 |
| **向量搜索** | HNSW 语义相似度搜索，支持多语言嵌入（100+ 种语言）|
| **Web 查看器** | 浏览器 UI 用于查看、搜索、添加、编辑、删除记忆 |
| **3 层搜索** | 渐进式披露相比获取所有内容节省约 87% 的 token |
| **生命周期管理** | 自动压缩、归档和清理旧会话 |
| **导出/导入** | 以 JSON 格式备份和恢复记忆 |

---

## 工作原理

```
会话 1: "使用 JWT 进行认证"        会话 2: "添加登录端点"
┌──────────────────────────┐          ┌──────────────────────────┐
│  你与 AI 编程...         │          │  AI 已经知道:            │
│  AI 做出决策             │          │  ✓ JWT 认证决策          │
│  AI 遇到错误             │   ───►   │  ✓ 错误解决方案          │
│  AI 学习模式             │  已保存  │  ✓ 代码模式              │
│                          │          │  ✓ 会话上下文            │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% 本地)
```

1. **一次设置** — `npx agentkits-memory-setup` 配置你的平台
2. **自动捕获** — 钩子在你工作时记录决策、工具使用和摘要
3. **上下文注入** — 下一个会话开始时包含过去会话的相关历史记录
4. **后台处理** — 工作进程使用 AI 增强观察记录、生成嵌入、压缩旧数据
5. **随时搜索** — AI 使用 MCP 工具（`memory_search` → `memory_details`）查找过去的上下文

所有数据都保存在你机器上的 `.claude/memory/memory.db` 中。无云端。无需 API 密钥。

---

## 重要的设计决策

大多数记忆工具将数据分散在 markdown 文件中，需要 Python 运行时，或将你的代码发送到外部 API。AgentKits Memory 做出了根本不同的选择：

| 设计选择 | 重要性 |
|---------------|----------------|
| **单一 SQLite 数据库** | 一个文件（`memory.db`）包含所有内容 — 记忆、会话、观察记录、嵌入。无分散文件需要同步、无合并冲突、无孤立数据。备份 = 复制一个文件 |
| **原生 Node.js，零 Python 依赖** | 可在任何支持 Node 的地方运行。无需 conda、pip 或 virtualenv。与你的 MCP 服务器使用相同语言 — 一条 `npx` 命令，完成 |
| **节省 token 的 3 层搜索** | 首先搜索索引（约 50 token/结果），然后是时间线上下文，最后是完整详情。只获取你需要的内容。其他工具将整个记忆文件倾倒到上下文中，在不相关内容上浪费 token |
| **通过钩子自动捕获** | 决策、模式和错误在发生时被记录 — 而不是在你记得保存它们之后。会话上下文注入在下次会话开始时自动发生 |
| **本地嵌入，无 API 调用** | 向量搜索使用本地 ONNX 模型（multilingual-e5-small）。语义搜索离线工作、零成本，并支持 100+ 种语言 |
| **后台工作进程** | AI 增强、嵌入生成和压缩异步运行。你的编码流程永不被阻塞 |
| **从第一天起就支持多平台** | 一个 `--platform=all` 标志同时配置 Claude Code、Cursor、Windsurf、Cline 和 OpenCode。相同的记忆数据库，不同的编辑器 |
| **结构化观察数据** | 工具使用通过类型分类（读/写/执行/搜索）、文件跟踪、意图检测和 AI 生成的叙述被捕获 — 而不是原始文本转储 |
| **无进程泄漏** | 后台工作进程在 5 分钟后自动终止，使用基于 PID 的锁文件并清理过期锁，优雅处理 SIGTERM/SIGINT。无僵尸进程、无孤立工作进程 |
| **无内存泄漏** | 钩子作为短期进程运行（而非长期守护进程）。数据库连接在关闭时关闭。嵌入子进程具有有限重生次数（最多 2 次）、待处理请求超时，以及所有计时器和队列的优雅清理 |

---

## Web 查看器

通过现代 Web 界面查看和管理你的记忆。

```bash
npx agentkits-memory-web
```

然后在浏览器中打开 **http://localhost:1905**。

### 会话列表

浏览所有会话，支持时间线视图和活动详情。

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### 记忆列表

浏览所有已存储的记忆，支持搜索和命名空间过滤。

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### 添加记忆

创建新记忆，包含键、命名空间、类型、内容和标签。

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### 记忆详情

查看完整的记忆详情，包含编辑和删除选项。

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### 管理嵌入

生成和管理用于语义搜索的向量嵌入。

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## 快速开始

### 方式一：Claude Code 插件市场（推荐用于 Claude Code）

一条命令安装即可——无需手动配置：

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@aitytech
```

这会自动安装钩子、MCP 服务器和记忆工作流技能。安装后请重启 Claude Code。

### 方式二：自动设置（所有平台）

```bash
npx agentkits-memory-setup
```

这会自动检测你的平台并配置所有内容：MCP 服务器、钩子（Claude Code/OpenCode）、规则文件（Cursor/Windsurf/Cline），并下载嵌入模型。

**针对特定平台：**

```bash
npx agentkits-memory-setup --platform=cursor
npx agentkits-memory-setup --platform=windsurf,cline
npx agentkits-memory-setup --platform=all
```

### 方式三：手动 MCP 配置

如果你喜欢手动设置，请将以下内容添加到你的 MCP 配置中：

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

配置文件位置：
- **Claude Code**: `.claude/settings.json`（嵌入在 `mcpServers` 键中）
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json`（项目根目录）

### 3. MCP 工具

配置完成后，你的 AI 助手可以使用这些工具：

| 工具 | 描述 |
|------|-------------|
| `memory_status` | 检查记忆系统状态（首先调用！）|
| `memory_save` | 保存决策、模式、错误或上下文 |
| `memory_search` | **[步骤 1]** 搜索索引 — 轻量级 ID + 标题（约 50 token/结果）|
| `memory_timeline` | **[步骤 2]** 获取记忆周围的时间上下文 |
| `memory_details` | **[步骤 3]** 获取特定 ID 的完整内容 |
| `memory_recall` | 快速主题概览 — 分组摘要 |
| `memory_list` | 列出最近的记忆 |
| `memory_update` | 更新现有记忆内容或标签 |
| `memory_delete` | 删除过时的记忆 |

---

## 渐进式披露（节省 Token 的搜索）

AgentKits Memory 使用 **3 层搜索模式**，相比提前获取完整内容节省约 70% 的 token。

### 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│  步骤 1: memory_search                                      │
│  返回：ID、标题、标签、分数（约 50 token/项）               │
│  → 查看索引，选择相关记忆                                   │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 2: memory_timeline（可选）                            │
│  返回：记忆前后 ±30 分钟的上下文                            │
│  → 了解之前/之后发生的事情                                  │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 3: memory_details                                     │
│  返回：仅选定 ID 的完整内容                                 │
│  → 只获取你真正需要的内容                                   │
└─────────────────────────────────────────────────────────────┘
```

### 示例工作流

```typescript
// 步骤 1：搜索 - 获取轻量级索引
memory_search({ query: "authentication" })
// → 返回：[{ id: "abc", title: "JWT pattern...", score: 85% }]

// 步骤 2：（可选）查看时间上下文
memory_timeline({ anchor: "abc" })
// → 返回：此记忆前后发生的事情

// 步骤 3：仅获取你需要的完整内容
memory_details({ ids: ["abc"] })
// → 返回：选定记忆的完整内容
```

### Token 节省

| 方法 | 使用的 Token |
|----------|-------------|
| **旧方法：** 获取所有内容 | 约 500 token × 10 个结果 = 5000 token |
| **新方法：** 渐进式披露 | 50 × 10 + 500 × 2 = 1500 token |
| **节省** | **减少 70%** |

---

## CLI 命令

```bash
# 一键设置（自动检测平台）
npx agentkits-memory-setup
npx agentkits-memory-setup --platform=cursor      # 特定平台
npx agentkits-memory-setup --platform=all          # 所有平台
npx agentkits-memory-setup --force                 # 重新安装/更新

# 启动 MCP 服务器
npx agentkits-memory-server

# Web 查看器（端口 1905）
npx agentkits-memory-web

# 终端查看器
npx agentkits-memory-viewer
npx agentkits-memory-viewer --stats                # 数据库统计
npx agentkits-memory-viewer --json                 # JSON 输出

# 从 CLI 保存
npx agentkits-memory-save "Use JWT with refresh tokens" --category pattern --tags auth,security

# 设置
npx agentkits-memory-hook settings .               # 查看当前设置
npx agentkits-memory-hook settings . --reset       # 重置为默认值
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# 导出 / 导入
npx agentkits-memory-hook export . my-project ./backup.json
npx agentkits-memory-hook import . ./backup.json

# 生命周期管理
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30
npx agentkits-memory-hook lifecycle-stats .
```

---

## 编程方式使用

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// 存储记忆
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// 查询记忆
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// 通过键获取
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## 自动捕获钩子

钩子自动捕获你的 AI 编程会话（仅限 Claude Code 和 OpenCode）：

| 钩子 | 触发器 | 操作 |
|------|---------|--------|
| `context` | 会话开始 | 注入上一个会话的上下文 + 记忆状态 |
| `session-init` | 用户提示 | 初始化/恢复会话，记录提示 |
| `observation` | 工具使用后 | 捕获工具使用情况并进行意图检测 |
| `summarize` | 会话结束 | 生成结构化会话摘要 |
| `user-message` | 会话开始 | 向用户显示记忆状态（stderr）|

设置钩子：
```bash
npx agentkits-memory-setup
```

**自动捕获的内容：**
- 文件读/写及路径
- 结构化差异代码更改（之前 → 之后）
- 开发者意图（bug 修复、功能、重构、调查等）
- 包含决策、错误和后续步骤的会话摘要
- 会话内的多提示跟踪

---

## 多平台支持

| 平台 | MCP | 钩子 | 规则文件 | 设置 |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ 完整 | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ 完整 | — | `--platform=opencode` |

- **MCP 服务器** 适用于所有平台（通过 MCP 协议的记忆工具）
- **钩子** 在 Claude Code 和 OpenCode 上提供自动捕获
- **规则文件** 教 Cursor/Windsurf/Cline 记忆工作流程
- **记忆数据** 始终存储在 `.claude/memory/` 中（单一真实来源）

---

## 后台工作进程

每次会话后，后台工作进程处理排队的任务：

| 工作进程 | 任务 | 描述 |
|--------|------|-------------|
| `embed-session` | 嵌入 | 为语义搜索生成向量嵌入 |
| `enrich-session` | AI 增强 | 使用 AI 生成的摘要、事实、概念来增强观察记录 |
| `compress-session` | 压缩 | 压缩旧观察记录（10:1–25:1）并生成会话摘要（20:1–100:1）|

工作进程在会话结束后自动运行。每个工作进程：
- 每次运行最多处理 200 项
- 使用锁文件防止并发执行
- 5 分钟后自动终止（防止僵尸进程）
- 失败任务最多重试 3 次

---

## AI 提供商配置

AI 增强使用可插拔的提供商。默认为 `claude-cli`（无需 API 密钥）。

| 提供商 | 类型 | 默认模型 | 备注 |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | 使用 `claude --print`，无需 API 密钥 |
| **OpenAI** | `openai` | `gpt-4o-mini` | 任何 OpenAI 模型 |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Google AI Studio 密钥 |
| **OpenRouter** | `openai` | 任意 | 将 `baseUrl` 设置为 `https://openrouter.ai/api/v1` |
| **GLM (智谱)** | `openai` | 任意 | 将 `baseUrl` 设置为 `https://open.bigmodel.cn/api/paas/v4` |
| **Ollama** | `openai` | 任意 | 将 `baseUrl` 设置为 `http://localhost:11434/v1` |

### 选项 1：环境变量

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter（使用 OpenAI 兼容格式）
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# 本地 Ollama（无需 API 密钥）
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# 完全禁用 AI 增强
export AGENTKITS_AI_ENRICHMENT=false
```

### 选项 2：持久化设置

```bash
# 保存到 .claude/memory/settings.json — 跨会话持久化
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx agentkits-memory-hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx agentkits-memory-hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# 查看当前设置
npx agentkits-memory-hook settings .

# 重置为默认值
npx agentkits-memory-hook settings . --reset
```

> **优先级：** 环境变量覆盖 settings.json。settings.json 覆盖默认值。

---

## 生命周期管理

管理随时间推移的记忆增长：

```bash
# 压缩 7 天前的观察记录，归档 30 天前的会话
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30

# 同时自动删除 90 天前的已归档会话
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# 查看生命周期统计
npx agentkits-memory-hook lifecycle-stats .
```

| 阶段 | 发生的事情 |
|-------|-------------|
| **压缩** | AI 压缩观察记录，生成会话摘要 |
| **归档** | 将旧会话标记为已归档（从上下文中排除）|
| **删除** | 删除已归档的会话（选择性加入，需要 `--delete`）|

---

## 导出 / 导入

备份和恢复你的项目记忆：

```bash
# 导出项目的所有会话
npx agentkits-memory-hook export . my-project ./backup.json

# 从备份导入（自动去重）
npx agentkits-memory-hook import . ./backup.json
```

导出格式包括会话、观察记录、提示和摘要。

---

## 记忆类别

| 类别 | 使用场景 |
|----------|----------|
| `decision` | 架构决策、技术栈选择、权衡 |
| `pattern` | 编码约定、项目模式、重复出现的方法 |
| `error` | Bug 修复、错误解决方案、调试见解 |
| `context` | 项目背景、团队约定、环境设置 |
| `observation` | 自动捕获的会话观察记录 |

---

## 存储

记忆存储在项目目录下的 `.claude/memory/` 中。

```
.claude/memory/
├── memory.db          # SQLite 数据库（所有数据）
├── memory.db-wal      # 预写日志（临时）
├── settings.json      # 持久化设置（AI 提供商、上下文配置）
└── embeddings-cache/  # 缓存的向量嵌入
```

---

## CJK 语言支持

AgentKits Memory 对中文、日文和韩文文本搜索具有 **自动 CJK 支持**。

### 零配置

当 `better-sqlite3` 安装后（默认），CJK 搜索自动工作：

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// 存储 CJK 内容
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// 使用日语、中文或韩语搜索 - 开箱即用！
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### 工作原理

- **原生 SQLite**：使用 `better-sqlite3` 以获得最大性能
- **Trigram 分词器**：带有 trigram 的 FTS5 为 CJK 匹配创建 3 字符序列
- **智能降级**：短 CJK 查询（< 3 个字符）自动使用 LIKE 搜索
- **BM25 排名**：搜索结果的相关性评分

### 高级：日语分词

对于具有正确分词的高级日语处理，可选择使用 lindera：

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

需要 [lindera-sqlite](https://github.com/lindera/lindera-sqlite) 构建。

---

## API 参考

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // 默认：'.claude/memory'
  dbFilename: string;           // 默认：'memory.db'
  enableVectorIndex: boolean;   // 默认：false
  dimensions: number;           // 默认：384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // 默认：true
  cacheSize: number;            // 默认：1000
  cacheTtl: number;             // 默认：300000（5 分钟）
}
```

### 方法

| 方法 | 描述 |
|--------|-------------|
| `initialize()` | 初始化记忆服务 |
| `shutdown()` | 关闭并持久化更改 |
| `storeEntry(input)` | 存储记忆条目 |
| `get(id)` | 通过 ID 获取条目 |
| `getByKey(namespace, key)` | 通过命名空间和键获取条目 |
| `update(id, update)` | 更新条目 |
| `delete(id)` | 删除条目 |
| `query(query)` | 使用过滤器查询条目 |
| `semanticSearch(content, k)` | 语义相似度搜索 |
| `count(namespace?)` | 计数条目 |
| `listNamespaces()` | 列出所有命名空间 |
| `getStats()` | 获取统计信息 |

---

## 要求

- **Node.js LTS**：18.x、20.x 或 22.x（推荐）
- 兼容 MCP 的 AI 编程助手

### Node.js 版本说明

此包使用需要原生二进制文件的 `better-sqlite3`。**仅 LTS 版本提供预构建二进制文件**。

| Node 版本 | 状态 | 备注 |
|--------------|--------|-------|
| 18.x LTS | ✅ 可用 | 预构建二进制文件 |
| 20.x LTS | ✅ 可用 | 预构建二进制文件 |
| 22.x LTS | ✅ 可用 | 预构建二进制文件 |
| 19.x, 21.x, 23.x | ⚠️ 需要构建工具 | 无预构建二进制文件 |

### 使用非 LTS 版本（Windows）

如果你必须使用非 LTS 版本（19、21、23），请先安装构建工具：

**选项 1：Visual Studio Build Tools**
```powershell
# 从以下网址下载并安装：
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 选择"使用 C++ 的桌面开发"工作负载
```

**选项 2：windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**选项 3：Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

有关更多详情，请参阅 [node-gyp Windows 指南](https://github.com/nodejs/node-gyp#on-windows)。

---

## AgentKits 生态系统

**AgentKits Memory** 是 AityTech 的 AgentKits 生态系统的一部分 - 让 AI 编程助手更智能的工具。

| 产品 | 描述 | 链接 |
|---------|-------------|------|
| **AgentKits Engineer** | 28 个专门的代理、100+ 项技能、企业模式 | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | AI 驱动的营销内容生成 | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | AI 助手的持久化记忆（本包）| [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## Star 历史

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## 许可证

MIT

---

<p align="center">
  <strong>给你的 AI 助手持久化的记忆。</strong>
</p>

<p align="center">
  <em>AgentKits Memory 由 AityTech 出品</em>
</p>

<p align="center">
  如果这个项目对你的 AI 记忆有帮助，请给仓库点个 Star。
</p>