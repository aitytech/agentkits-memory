<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>by <strong>AityTech</strong></em>
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
  <strong>AIコーディングアシスタント向けの永続的メモリシステム</strong>
</p>

<p align="center">
  AIアシスタントはセッション間ですべてを忘れてしまいます。AgentKits Memoryがそれを解決します。<br>
  決定事項、パターン、エラー、コンテキスト — すべてMCPを通じてローカルに永続化されます。
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">ウェブサイト</a> •
  <a href="https://www.agentkits.net/memory/docs">ドキュメント</a> •
  <a href="#クイックスタート">クイックスタート</a> •
  <a href="#仕組み">仕組み</a> •
  <a href="#マルチプラットフォーム対応">プラットフォーム</a> •
  <a href="#cliコマンド">CLI</a> •
  <a href="#webビューア">Webビューア</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <strong>日本語</strong> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## 機能

| 機能 | メリット |
|---------|---------|
| **100%ローカル** | すべてのデータがあなたのマシンに保存されます。クラウド不要、APIキー不要、アカウント不要 |
| **超高速** | ネイティブSQLite (better-sqlite3) = 瞬時のクエリ、レイテンシゼロ |
| **設定不要** | すぐに使えます。データベースのセットアップは不要 |
| **マルチプラットフォーム** | Claude Code、Cursor、Windsurf、Cline、OpenCode — 1つのセットアップコマンドで対応 |
| **MCPサーバー** | 9つのツール: save、search、timeline、details、recall、list、update、delete、status |
| **自動キャプチャ** | フックがセッションコンテキスト、ツール使用状況、サマリーを自動的にキャプチャ |
| **AIエンリッチメント** | バックグラウンドワーカーがAI生成サマリーで観測データをエンリッチ |
| **ベクトル検索** | 多言語埋め込み(100以上の言語)によるsqlite-vecセマンティック類似性検索 |
| **Webビューア** | ブラウザUIでメモリの表示、検索、追加、編集、削除が可能 |
| **3層検索** | 段階的開示により、すべてを取得する場合と比較して約87%のトークンを節約 |
| **ライフサイクル管理** | 古いセッションの自動圧縮、アーカイブ、クリーンアップ |
| **エクスポート/インポート** | メモリをJSONとしてバックアップおよび復元 |

---

## 仕組み

```
セッション1: "認証にJWTを使用"        セッション2: "ログインエンドポイントを追加"
┌──────────────────────────┐          ┌──────────────────────────┐
│  AIとコーディング...      │          │  AIはすでに知っている:    │
│  AIが決定を下す           │          │  ✓ JWT認証の決定          │
│  AIがエラーに遭遇         │   ───►   │  ✓ エラーの解決策         │
│  AIがパターンを学習       │  保存    │  ✓ コードパターン         │
│                          │          │  ✓ セッションコンテキスト │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite、100%ローカル)
```

1. **1回セットアップ** — `npx @aitytech/agentkits-memory`でプラットフォームを設定
2. **自動キャプチャ** — 作業中に決定事項、ツール使用状況、サマリーをフックが記録
3. **コンテキスト注入** — 次のセッションは過去のセッションの関連履歴から始まります
4. **バックグラウンド処理** — ワーカーがAIで観測データをエンリッチし、埋め込みを生成し、古いデータを圧縮
5. **いつでも検索** — AIはMCPツール(`memory_search` → `memory_details`)を使って過去のコンテキストを検索

すべてのデータは、あなたのマシン上の`.claude/memory/memory.db`に保存されます。クラウドなし。APIキー不要。

---

## 重要な設計上の決定

ほとんどのメモリツールは、データをMarkdownファイルに分散させたり、Pythonランタイムを必要としたり、コードを外部APIに送信したりします。AgentKits Memoryは根本的に異なる選択をしています:

| 設計上の選択 | 重要な理由 |
|---------------|----------------|
| **単一のSQLiteデータベース** | 1つのファイル(`memory.db`)がすべてを保持 — メモリ、セッション、観測、埋め込み。同期すべき分散ファイルなし、マージ競合なし、孤立データなし。バックアップ = 1ファイルのコピー |
| **ネイティブNode.js、Python不要** | Nodeが動作するところならどこでも動作。conda不要、pip不要、virtualenv不要。MCPサーバーと同じ言語 — 1つの`npx`コマンドで完了 |
| **トークン効率的な3層検索** | まず検索インデックス(~50トークン/結果)、次にタイムラインコンテキスト、その後完全な詳細。必要なものだけを取得。他のツールはメモリファイル全体をコンテキストにダンプし、無関係なコンテンツでトークンを消費 |
| **フックによる自動キャプチャ** | 決定事項、パターン、エラーは発生時に記録される — 保存を思い出した後ではありません。セッションコンテキスト注入は次のセッション開始時に自動的に発生 |
| **ローカル埋め込み、API呼び出し不要** | ベクトル検索はローカルONNXモデル(multilingual-e5-small)を使用。セマンティック検索はオフラインで動作し、コストゼロ、100以上の言語をサポート |
| **バックグラウンドワーカー** | AIエンリッチメント、埋め込み生成、圧縮は非同期で実行。コーディングフローは決してブロックされません |
| **初日からマルチプラットフォーム** | 1つの`--platform=all`フラグで、Claude Code、Cursor、Windsurf、Cline、OpenCodeを同時に設定。同じメモリデータベース、異なるエディター |
| **構造化された観測データ** | ツール使用状況は、タイプ分類(read/write/execute/search)、ファイル追跡、インテント検出、AI生成ナラティブとともにキャプチャ — 生のテキストダンプではありません |
| **プロセスリークなし** | バックグラウンドワーカーは5分後に自己終了し、PIDベースのロックファイルと古いロックのクリーンアップを使用し、SIGTERM/SIGINTを適切に処理。ゾンビプロセスなし、孤立ワーカーなし |
| **メモリリークなし** | フックは短命プロセスとして実行(長時間実行デーモンではない)。データベース接続はシャットダウン時にクローズ。埋め込みサブプロセスには制限付き再起動(最大2回)、保留中のリクエストタイムアウト、すべてのタイマーとキューの適切なクリーンアップがあります |

---

## Webビューア

モダンなWebインターフェースでメモリを表示および管理します。

```bash
npx @aitytech/agentkits-memory web
```

その後、ブラウザで**http://localhost:1905**を開きます。

### セッションリスト

タイムラインビューとアクティビティ詳細で全セッションを閲覧します。

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### メモリリスト

検索と名前空間フィルタリングで保存されたすべてのメモリを閲覧します。

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### メモリを追加

キー、名前空間、タイプ、コンテンツ、タグで新しいメモリを作成します。

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### メモリの詳細

編集および削除オプション付きでメモリの完全な詳細を表示します。

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### 埋め込み管理

セマンティック検索用のベクトル埋め込みを生成および管理します。

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## クイックスタート

### オプション1: Claude Codeプラグインマーケットプレイス (Claude Code推奨)

1つのコマンドでインストール — 手動設定不要：

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@agentkits-memory
```

フック、MCPサーバー、メモリワークフロースキルが自動的にインストールされます。インストール後にClaude Codeを再起動してください。

### オプション2: 自動セットアップ (全プラットフォーム)

```bash
npx @aitytech/agentkits-memory
```

これにより、プラットフォームを自動検出し、すべてを設定します: MCPサーバー、フック(Claude Code/OpenCode)、rulesファイル(Cursor/Windsurf/Cline)、および埋め込みモデルのダウンロード。

**特定のプラットフォームをターゲットにする:**

```bash
npx @aitytech/agentkits-memory setup --platform=cursor
npx @aitytech/agentkits-memory setup --platform=windsurf,cline
npx @aitytech/agentkits-memory setup --platform=all
```

### オプション3: 手動MCP設定

手動セットアップを希望する場合は、MCP設定に追加します:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@aitytech/agentkits-memory", "server"]
    }
  }
}
```

設定ファイルの場所:
- **Claude Code**: `.claude/settings.json` (`mcpServers`キーに埋め込み)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (プロジェクトルート)

### 3. MCPツール

設定が完了すると、AIアシスタントは次のツールを使用できます:

| ツール | 説明 |
|------|-------------|
| `memory_status` | メモリシステムのステータスを確認(最初に呼び出す!) |
| `memory_save` | 決定事項、パターン、エラー、またはコンテキストを保存 |
| `memory_search` | **[ステップ1]** インデックスを検索 — 軽量なID+タイトル(~50トークン/結果) |
| `memory_timeline` | **[ステップ2]** メモリ周辺の時系列コンテキストを取得 |
| `memory_details` | **[ステップ3]** 特定のIDの完全なコンテンツを取得 |
| `memory_recall` | クイックトピック概要 — グループ化されたサマリー |
| `memory_list` | 最近のメモリをリスト表示 |
| `memory_update` | 既存のメモリコンテンツまたはタグを更新 |
| `memory_delete` | 古いメモリを削除 |

---

## 段階的開示(トークン効率的な検索)

AgentKits Memoryは、完全なコンテンツを前もって取得する場合と比較して約70%のトークンを節約する**3層検索パターン**を使用します。

### 仕組み

```
┌─────────────────────────────────────────────────────────────┐
│  ステップ1: memory_search                                    │
│  返却: ID、タイトル、タグ、スコア(~50トークン/項目)          │
│  → インデックスをレビューし、関連メモリを選択                │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  ステップ2: memory_timeline(オプション)                      │
│  返却: メモリ前後±30分のコンテキスト                         │
│  → 前後に何が起こったかを理解                                │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  ステップ3: memory_details                                  │
│  返却: 選択したIDのみの完全なコンテンツ                      │
│  → 実際に必要なものだけを取得                                │
└─────────────────────────────────────────────────────────────┘
```

### ワークフローの例

```typescript
// ステップ1: 検索 - 軽量インデックスを取得
memory_search({ query: "authentication" })
// → 返却: [{ id: "abc", title: "JWTパターン...", score: 85% }]

// ステップ2: (オプション)時系列コンテキストを確認
memory_timeline({ anchor: "abc" })
// → 返却: このメモリの前後に何が起こったか

// ステップ3: 必要なもののみの完全なコンテンツを取得
memory_details({ ids: ["abc"] })
// → 返却: 選択したメモリの完全なコンテンツ
```

### トークン節約

| アプローチ | 使用トークン |
|----------|-------------|
| **旧:** すべてのコンテンツを取得 | ~500トークン × 10結果 = 5000トークン |
| **新:** 段階的開示 | 50 × 10 + 500 × 2 = 1500トークン |
| **節約** | **70%削減** |

---

## CLIコマンド

```bash
# 1コマンドセットアップ(プラットフォームを自動検出)
npx @aitytech/agentkits-memory
npx @aitytech/agentkits-memory setup --platform=cursor      # 特定のプラットフォーム
npx @aitytech/agentkits-memory setup --platform=all          # すべてのプラットフォーム
npx @aitytech/agentkits-memory setup --force                 # 再インストール/更新

# MCPサーバーを起動
npx @aitytech/agentkits-memory server

# Webビューア(ポート1905)
npx @aitytech/agentkits-memory web

# ターミナルビューア
npx @aitytech/agentkits-memory viewer
npx @aitytech/agentkits-memory viewer --stats                # データベース統計
npx @aitytech/agentkits-memory viewer --json                 # JSON出力

# CLIから保存
npx @aitytech/agentkits-memory save "リフレッシュトークン付きJWTを使用" --category pattern --tags auth,security

# 設定
npx @aitytech/agentkits-memory hook settings .               # 現在の設定を表示
npx @aitytech/agentkits-memory hook settings . --reset       # デフォルトにリセット
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# エクスポート/インポート
npx @aitytech/agentkits-memory hook export . my-project ./backup.json
npx @aitytech/agentkits-memory hook import . ./backup.json

# ライフサイクル管理
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30
npx @aitytech/agentkits-memory hook lifecycle-stats .
```

---

## プログラマティック使用

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// メモリを保存
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証にリフレッシュトークン付きJWTを使用',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// メモリをクエリ
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// キーで取得
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## 自動キャプチャフック

フックは自動的にAIコーディングセッションをキャプチャします(Claude CodeとOpenCodeのみ):

| フック | トリガー | アクション |
|------|---------|--------|
| `context` | セッション開始 | 前のセッションコンテキスト+メモリステータスを注入 |
| `session-init` | ユーザープロンプト | セッションを初期化/再開、プロンプトを記録 |
| `observation` | ツール使用後 | インテント検出でツール使用状況をキャプチャ |
| `summarize` | セッション終了 | 構造化されたセッションサマリーを生成 |
| `user-message` | セッション開始 | ユーザーにメモリステータスを表示(stderr) |

フックのセットアップ:
```bash
npx @aitytech/agentkits-memory
```

**自動的にキャプチャされるもの:**
- パス付きファイルの読み取り/書き込み
- 構造化された差分としてのコード変更(変更前→変更後)
- 開発者のインテント(バグ修正、機能、リファクタリング、調査など)
- 決定事項、エラー、次のステップを含むセッションサマリー
- セッション内のマルチプロンプト追跡

---

## マルチプラットフォーム対応

| プラットフォーム | MCP | フック | Rulesファイル | セットアップ |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ フル | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ フル | — | `--platform=opencode` |

- **MCPサーバー**はすべてのプラットフォームで動作(MCPプロトコル経由のメモリツール)
- **フック**はClaude CodeとOpenCodeで自動キャプチャを提供
- **Rulesファイル**はCursor/Windsurf/Clineにメモリワークフローを教える
- **メモリデータ**は常に`.claude/memory/`に保存(単一の信頼できる情報源)

---

## バックグラウンドワーカー

各セッションの後、バックグラウンドワーカーがキューに入れられたタスクを処理します:

| ワーカー | タスク | 説明 |
|--------|------|-------------|
| `embed-session` | 埋め込み | セマンティック検索用のベクトル埋め込みを生成 |
| `enrich-session` | AIエンリッチメント | AI生成のサマリー、事実、概念で観測データをエンリッチ |
| `compress-session` | 圧縮 | 古い観測データを圧縮(10:1–25:1)し、セッションダイジェストを生成(20:1–100:1) |

ワーカーはセッション終了後に自動的に実行されます。各ワーカーは:
- 1回の実行で最大200項目を処理
- ロックファイルを使用して同時実行を防止
- 5分後に自動終了(ゾンビを防止)
- 失敗したタスクを最大3回再試行

---

## AIプロバイダー設定

AIエンリッチメントはプラグ可能なプロバイダーを使用します。デフォルトは`claude-cli`(APIキー不要)です。

| プロバイダー | タイプ | デフォルトモデル | 備考 |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | `claude --print`を使用、APIキー不要 |
| **OpenAI** | `openai` | `gpt-4o-mini` | 任意のOpenAIモデル |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Google AI Studioキー |
| **OpenRouter** | `openai` | 任意 | `baseUrl`を`https://openrouter.ai/api/v1`に設定 |
| **GLM (Zhipu)** | `openai` | 任意 | `baseUrl`を`https://open.bigmodel.cn/api/paas/v4`に設定 |
| **Ollama** | `openai` | 任意 | `baseUrl`を`http://localhost:11434/v1`に設定 |

### オプション1: 環境変数

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter(OpenAI互換フォーマットを使用)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# ローカルOllama(APIキー不要)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# AIエンリッチメントを完全に無効化
export AGENTKITS_AI_ENRICHMENT=false
```

### オプション2: 永続的な設定

```bash
# .claude/memory/settings.jsonに保存 — セッション間で永続化
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx @aitytech/agentkits-memory hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# 現在の設定を表示
npx @aitytech/agentkits-memory hook settings .

# デフォルトにリセット
npx @aitytech/agentkits-memory hook settings . --reset
```

> **優先順位:** 環境変数がsettings.jsonをオーバーライドします。settings.jsonがデフォルトをオーバーライドします。

---

## ライフサイクル管理

時間の経過に伴うメモリの増加を管理します:

```bash
# 7日以上前の観測データを圧縮し、30日以上前のセッションをアーカイブ
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30

# 90日以上前のアーカイブされたセッションも自動削除
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# ライフサイクル統計を表示
npx @aitytech/agentkits-memory hook lifecycle-stats .
```

| ステージ | 何が起こるか |
|-------|-------------|
| **圧縮** | 観測データをAI圧縮し、セッションダイジェストを生成 |
| **アーカイブ** | 古いセッションをアーカイブ済みとしてマーク(コンテキストから除外) |
| **削除** | アーカイブされたセッションを削除(オプトイン、`--delete`が必要) |

---

## エクスポート/インポート

プロジェクトメモリをバックアップおよび復元します:

```bash
# プロジェクトのすべてのセッションをエクスポート
npx @aitytech/agentkits-memory hook export . my-project ./backup.json

# バックアップからインポート(自動的に重複排除)
npx @aitytech/agentkits-memory hook import . ./backup.json
```

エクスポート形式にはセッション、観測、プロンプト、サマリーが含まれます。

---

## メモリカテゴリー

| カテゴリー | ユースケース |
|----------|----------|
| `decision` | アーキテクチャの決定、技術スタックの選択、トレードオフ |
| `pattern` | コーディング規約、プロジェクトパターン、繰り返しアプローチ |
| `error` | バグ修正、エラーソリューション、デバッグインサイト |
| `context` | プロジェクトの背景、チーム規約、環境セットアップ |
| `observation` | 自動キャプチャされたセッション観測 |

---

## ストレージ

メモリは、プロジェクトディレクトリ内の`.claude/memory/`に保存されます。

```
.claude/memory/
├── memory.db          # SQLiteデータベース(すべてのデータ)
├── memory.db-wal      # 先行書き込みログ(一時)
├── settings.json      # 永続的な設定(AIプロバイダー、コンテキスト設定)
└── embeddings-cache/  # キャッシュされたベクトル埋め込み
```

---

## CJK言語サポート

AgentKits Memoryは、中国語、日本語、韓国語のテキスト検索に対する**自動CJKサポート**を備えています。

### 設定不要

`better-sqlite3`がインストールされている場合(デフォルト)、CJK検索は自動的に機能します:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// CJKコンテンツを保存
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// 日本語、中国語、韓国語で検索 - そのまま動作します!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### 仕組み

- **ネイティブSQLite**: 最大のパフォーマンスのために`better-sqlite3`を使用
- **トライグラムトークナイザー**: FTS5とトライグラムがCJKマッチング用に3文字シーケンスを作成
- **スマートフォールバック**: 短いCJKクエリ(3文字未満)は自動的にLIKE検索を使用
- **BM25ランキング**: 検索結果の関連性スコアリング

### 高度: 日本語単語分割

適切な単語分割を伴う高度な日本語の場合、オプションでlinderaを使用できます:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

[lindera-sqlite](https://github.com/lindera/lindera-sqlite)のビルドが必要です。

---

## APIリファレンス

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // デフォルト: '.claude/memory'
  dbFilename: string;           // デフォルト: 'memory.db'
  enableVectorIndex: boolean;   // デフォルト: false
  dimensions: number;           // デフォルト: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // デフォルト: true
  cacheSize: number;            // デフォルト: 1000
  cacheTtl: number;             // デフォルト: 300000 (5分)
}
```

### メソッド

| メソッド | 説明 |
|--------|-------------|
| `initialize()` | メモリサービスを初期化 |
| `shutdown()` | シャットダウンして変更を永続化 |
| `storeEntry(input)` | メモリエントリーを保存 |
| `get(id)` | IDでエントリーを取得 |
| `getByKey(namespace, key)` | 名前空間とキーでエントリーを取得 |
| `update(id, update)` | エントリーを更新 |
| `delete(id)` | エントリーを削除 |
| `query(query)` | フィルターでエントリーをクエリ |
| `semanticSearch(content, k)` | セマンティック類似性検索 |
| `count(namespace?)` | エントリーをカウント |
| `listNamespaces()` | すべての名前空間をリスト表示 |
| `getStats()` | 統計を取得 |

---

## コード品質

AgentKits Memoryは21のテストスイートにわたる**970の単体テスト**で徹底的にテストされています。

| 指標 | カバレッジ |
|------|-----------|
| **ステートメント** | 90.29% |
| **ブランチ** | 80.85% |
| **関数** | 90.54% |
| **行** | 91.74% |

### テストカテゴリ

| カテゴリ | テスト数 | カバー内容 |
|----------|---------|-----------|
| コアメモリサービス | 56 | CRUD、検索、ページネーション、カテゴリ、タグ、インポート/エクスポート |
| SQLiteバックエンド | 65 | スキーマ、マイグレーション、FTS5、トランザクション、エラーハンドリング |
| sqlite-vecベクトルインデックス | 47 | 挿入、検索、削除、永続化、エッジケース |
| ハイブリッド検索 | 44 | FTS + ベクトル融合、スコアリング、ランキング、フィルター |
| トークンエコノミクス | 27 | 3層検索バジェット、トランケーション、最適化 |
| 埋め込みシステム | 63 | キャッシュ、サブプロセス、ローカルモデル、CJKサポート |
| フックシステム | 502 | コンテキスト、セッション初期化、オブザベーション、サマライズ、AI拡張、サービスライフサイクル、キューワーカー、アダプター、型 |
| MCPサーバー | 48 | 全9つのMCPツール、バリデーション、エラーレスポンス |
| CLI | 34 | プラットフォーム検出、ルール生成 |
| 統合テスト | 84 | エンドツーエンドフロー、埋め込み統合、マルチセッション |

```bash
# テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage
```

---

## 要件

- **Node.js LTS**: 18.x、20.x、または22.x(推奨)
- MCP互換AIコーディングアシスタント

### Node.jsバージョンに関する注意

このパッケージは、ネイティブバイナリを必要とする`better-sqlite3`を使用します。**ビルド済みバイナリはLTSバージョンのみで利用可能です**。

| Nodeバージョン | ステータス | 備考 |
|--------------|--------|-------|
| 18.x LTS | ✅ 動作 | ビルド済みバイナリ |
| 20.x LTS | ✅ 動作 | ビルド済みバイナリ |
| 22.x LTS | ✅ 動作 | ビルド済みバイナリ |
| 19.x, 21.x, 23.x | ⚠️ ビルドツールが必要 | ビルド済みバイナリなし |

### 非LTSバージョンの使用(Windows)

非LTSバージョン(19、21、23)を使用する必要がある場合は、まずビルドツールをインストールします:

**オプション1: Visual Studio Build Tools**
```powershell
# 以下からダウンロードしてインストール:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 「C++によるデスクトップ開発」ワークロードを選択
```

**オプション2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**オプション3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

詳細については[node-gyp Windowsガイド](https://github.com/nodejs/node-gyp#on-windows)を参照してください。

---

## AgentKitsエコシステム

**AgentKits Memory**は、AityTechによるAgentKitsエコシステムの一部です - AIコーディングアシスタントをよりスマートにするツール。

| プロダクト | 説明 | リンク |
|---------|-------------|------|
| **AgentKits Engineer** | 28の専門エージェント、100以上のスキル、エンタープライズパターン | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | AI駆動のマーケティングコンテンツ生成 | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | AIアシスタント用の永続的メモリ(このパッケージ) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## Star履歴

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## ライセンス

MIT

---

<p align="center">
  <strong>AIアシスタントに永続化するメモリを与えましょう。</strong>
</p>

<p align="center">
  <em>AgentKits Memory by AityTech</em>
</p>

<p align="center">
  役に立ったらこのリポジトリにスターをつけてください。
</p>