<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>bởi <strong>AityTech</strong></em>
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
  <strong>Hệ thống Bộ nhớ Lâu dài cho Trợ lý Lập trình AI</strong>
</p>

<p align="center">
  Trợ lý AI của bạn quên mọi thứ giữa các phiên làm việc. AgentKits Memory khắc phục điều đó.<br>
  Các quyết định, mẫu, lỗi và ngữ cảnh — tất cả được lưu trữ cục bộ qua MCP.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">Trang chủ</a> •
  <a href="https://www.agentkits.net/memory/docs">Tài liệu</a> •
  <a href="#bắt-đầu-nhanh">Bắt đầu nhanh</a> •
  <a href="#cách-hoạt-động">Cách hoạt động</a> •
  <a href="#hỗ-trợ-đa-nền-tảng">Nền tảng</a> •
  <a href="#lệnh-cli">CLI</a> •
  <a href="#giao-diện-web">Giao diện Web</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <strong>Tiếng Việt</strong> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## Tính năng

| Tính năng | Lợi ích |
|---------|---------|
| **100% Cục bộ** | Tất cả dữ liệu được lưu trên máy của bạn. Không có cloud, không cần API key, không cần tài khoản |
| **Cực kỳ Nhanh** | SQLite gốc (better-sqlite3) = truy vấn tức thì, độ trễ bằng 0 |
| **Không cần Cấu hình** | Hoạt động ngay sau khi cài đặt. Không cần thiết lập database |
| **Đa Nền tảng** | Claude Code, Cursor, Windsurf, Cline, OpenCode — chỉ một lệnh thiết lập |
| **MCP Server** | 9 công cụ: save, search, timeline, details, recall, list, update, delete, status |
| **Tự động Thu thập** | Hooks tự động ghi lại ngữ cảnh phiên, sử dụng công cụ, tóm tắt |
| **Làm giàu bằng AI** | Workers chạy nền làm giàu quan sát với tóm tắt do AI tạo ra |
| **Tìm kiếm Vector** | Độ tương đồng ngữ nghĩa sqlite-vec với embeddings đa ngôn ngữ (100+ ngôn ngữ) |
| **Giao diện Web** | Giao diện trình duyệt để xem, tìm kiếm, thêm, sửa, xóa bộ nhớ |
| **Tìm kiếm 3 Lớp** | Tiết lộ tiến bộ tiết kiệm ~87% tokens so với tải toàn bộ |
| **Quản lý Vòng đời** | Tự động nén, lưu trữ và dọn dẹp các phiên cũ |
| **Export/Import** | Sao lưu và khôi phục bộ nhớ dưới dạng JSON |

---

## Cách hoạt động

```
Phiên 1: "Dùng JWT cho auth"         Phiên 2: "Thêm login endpoint"
┌──────────────────────────┐          ┌──────────────────────────┐
│  Bạn code với AI...      │          │  AI đã biết:             │
│  AI đưa ra quyết định    │          │  ✓ Quyết định JWT auth   │
│  AI gặp lỗi              │   ───►   │  ✓ Giải pháp lỗi         │
│  AI học các mẫu          │  saved   │  ✓ Mẫu code              │
│                          │          │  ✓ Ngữ cảnh phiên        │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% cục bộ)
```

1. **Thiết lập một lần** — `npx @aitytech/agentkits-memory` cấu hình nền tảng của bạn
2. **Tự động thu thập** — Hooks ghi lại quyết định, sử dụng công cụ và tóm tắt khi bạn làm việc
3. **Chèn ngữ cảnh** — Phiên tiếp theo bắt đầu với lịch sử liên quan từ các phiên trước
4. **Xử lý nền** — Workers làm giàu quan sát bằng AI, tạo embeddings, nén dữ liệu cũ
5. **Tìm kiếm mọi lúc** — AI sử dụng công cụ MCP (`memory_search` → `memory_details`) để tìm ngữ cảnh quá khứ

Tất cả dữ liệu được lưu trong `.claude/memory/memory.db` trên máy của bạn. Không có cloud. Không cần API key.

---

## Quyết định Thiết kế Quan trọng

Hầu hết các công cụ bộ nhớ phân tán dữ liệu qua các file markdown, yêu cầu Python runtime, hoặc gửi code của bạn đến API bên ngoài. AgentKits Memory đưa ra những lựa chọn khác biệt cơ bản:

| Lựa chọn Thiết kế | Tại sao Quan trọng |
|---------------|----------------|
| **Database SQLite đơn** | Một file (`memory.db`) chứa mọi thứ — bộ nhớ, phiên, quan sát, embeddings. Không có file phân tán cần đồng bộ, không có xung đột merge, không có dữ liệu mồ côi. Sao lưu = copy một file |
| **Node.js gốc, không cần Python** | Chạy ở bất cứ đâu Node chạy được. Không cần conda, không cần pip, không cần virtualenv. Cùng ngôn ngữ với MCP server — một lệnh `npx`, xong |
| **Tìm kiếm 3 lớp tiết kiệm tokens** | Tìm index trước (~50 tokens/kết quả), sau đó ngữ cảnh timeline, rồi chi tiết đầy đủ. Chỉ tải những gì cần. Các công cụ khác dump toàn bộ file bộ nhớ vào ngữ cảnh, tốn tokens cho nội dung không liên quan |
| **Tự động thu thập qua hooks** | Quyết định, mẫu và lỗi được ghi lại khi chúng xảy ra — không phải sau khi bạn nhớ lưu chúng. Chèn ngữ cảnh phiên diễn ra tự động khi phiên tiếp theo bắt đầu |
| **Embeddings cục bộ, không gọi API** | Tìm kiếm vector sử dụng mô hình ONNX cục bộ (multilingual-e5-small). Tìm kiếm ngữ nghĩa hoạt động offline, không tốn phí và hỗ trợ 100+ ngôn ngữ |
| **Workers chạy nền** | Làm giàu bằng AI, tạo embedding và nén chạy bất đồng bộ. Luồng code của bạn không bao giờ bị chặn |
| **Đa nền tảng ngay từ đầu** | Một flag `--platform=all` cấu hình Claude Code, Cursor, Windsurf, Cline và OpenCode cùng lúc. Cùng database bộ nhớ, các editor khác nhau |
| **Dữ liệu quan sát có cấu trúc** | Sử dụng công cụ được ghi lại với phân loại kiểu (read/write/execute/search), theo dõi file, phát hiện ý định và câu chuyện do AI tạo — không phải dump văn bản thô |
| **Không rò rỉ process** | Workers nền tự kết thúc sau 5 phút, sử dụng file khóa dựa trên PID với dọn dẹp khóa cũ, và xử lý SIGTERM/SIGINT một cách an toàn. Không có process zombie, không có worker mồ côi |
| **Không rò rỉ bộ nhớ** | Hooks chạy như các process ngắn hạn (không phải daemon chạy lâu). Kết nối database đóng khi shutdown. Subprocess embedding có respawn giới hạn (tối đa 2), timeout request đang chờ và dọn dẹp tất cả timers và queues một cách an toàn |

---

## Giao diện Web

Xem và quản lý bộ nhớ của bạn qua giao diện web hiện đại.

```bash
npx @aitytech/agentkits-memory web
```

Sau đó mở **http://localhost:1905** trong trình duyệt.

### Danh sách Phiên

Duyệt tất cả phiên làm việc với chế độ xem dòng thời gian và chi tiết hoạt động.

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### Danh sách Bộ nhớ

Duyệt tất cả bộ nhớ được lưu trữ với tìm kiếm và lọc namespace.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### Thêm Bộ nhớ

Tạo bộ nhớ mới với key, namespace, type, content và tags.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### Chi tiết Bộ nhớ

Xem chi tiết bộ nhớ đầy đủ với tùy chọn sửa và xóa.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### Quản lý Embeddings

Tạo và quản lý vector embeddings cho tìm kiếm ngữ nghĩa.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## Bắt đầu nhanh

### Cách 1: Chợ Plugin Claude Code (Khuyến nghị cho Claude Code)

Cài đặt bằng một lệnh duy nhất — không cần cấu hình thủ công:

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@agentkits-memory
```

Lệnh này tự động cài đặt hooks, MCP server và skill quy trình bộ nhớ. Khởi động lại Claude Code sau khi cài đặt.

### Cách 2: Thiết lập Tự động (Tất cả Nền tảng)

```bash
npx @aitytech/agentkits-memory
```

Lệnh này tự động phát hiện nền tảng của bạn và cấu hình mọi thứ: MCP server, hooks (Claude Code/OpenCode), rules files (Cursor/Windsurf/Cline), và tải xuống mô hình embedding.

**Chỉ định nền tảng cụ thể:**

```bash
npx @aitytech/agentkits-memory setup --platform=cursor
npx @aitytech/agentkits-memory setup --platform=windsurf,cline
npx @aitytech/agentkits-memory setup --platform=all
```

### Cách 3: Cấu hình MCP Thủ công

Nếu bạn muốn thiết lập thủ công, thêm vào cấu hình MCP của bạn:

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

Vị trí file cấu hình:
- **Claude Code**: `.claude/settings.json` (nhúng trong key `mcpServers`)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (thư mục gốc project)

### 3. Công cụ MCP

Sau khi cấu hình, trợ lý AI của bạn có thể sử dụng các công cụ này:

| Công cụ | Mô tả |
|------|-------------|
| `memory_status` | Kiểm tra trạng thái hệ thống bộ nhớ (gọi đầu tiên!) |
| `memory_save` | Lưu quyết định, mẫu, lỗi hoặc ngữ cảnh |
| `memory_search` | **[Bước 1]** Tìm kiếm index — IDs + tiêu đề nhẹ (~50 tokens/kết quả) |
| `memory_timeline` | **[Bước 2]** Lấy ngữ cảnh thời gian xung quanh một bộ nhớ |
| `memory_details` | **[Bước 3]** Lấy nội dung đầy đủ cho các IDs cụ thể |
| `memory_recall` | Tổng quan chủ đề nhanh — tóm tắt theo nhóm |
| `memory_list` | Liệt kê bộ nhớ gần đây |
| `memory_update` | Cập nhật nội dung hoặc tags của bộ nhớ hiện có |
| `memory_delete` | Xóa bộ nhớ đã lỗi thời |

---

## Tiết lộ Tiến bộ (Tìm kiếm Tiết kiệm Tokens)

AgentKits Memory sử dụng **mẫu tìm kiếm 3 lớp** tiết kiệm ~70% tokens so với tải nội dung đầy đủ ngay từ đầu.

### Cách hoạt động

```
┌─────────────────────────────────────────────────────────────┐
│  Bước 1: memory_search                                      │
│  Trả về: IDs, tiêu đề, tags, điểm (~50 tokens/item)        │
│  → Xem xét index, chọn bộ nhớ liên quan                     │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Bước 2: memory_timeline (tùy chọn)                         │
│  Trả về: Ngữ cảnh ±30 phút xung quanh bộ nhớ               │
│  → Hiểu điều gì đã xảy ra trước/sau                         │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Bước 3: memory_details                                     │
│  Trả về: Nội dung đầy đủ chỉ cho các IDs đã chọn           │
│  → Chỉ tải những gì bạn thực sự cần                         │
└─────────────────────────────────────────────────────────────┘
```

### Ví dụ Quy trình

```typescript
// Bước 1: Tìm kiếm - lấy index nhẹ
memory_search({ query: "authentication" })
// → Trả về: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// Bước 2: (Tùy chọn) Xem ngữ cảnh thời gian
memory_timeline({ anchor: "abc" })
// → Trả về: Điều gì đã xảy ra trước/sau bộ nhớ này

// Bước 3: Lấy nội dung đầy đủ chỉ cho những gì bạn cần
memory_details({ ids: ["abc"] })
// → Trả về: Nội dung đầy đủ cho bộ nhớ đã chọn
```

### Tiết kiệm Tokens

| Cách tiếp cận | Tokens Sử dụng |
|----------|-------------|
| **Cũ:** Tải tất cả nội dung | ~500 tokens × 10 kết quả = 5000 tokens |
| **Mới:** Tiết lộ tiến bộ | 50 × 10 + 500 × 2 = 1500 tokens |
| **Tiết kiệm** | **Giảm 70%** |

---

## Lệnh CLI

```bash
# Thiết lập một lệnh (tự động phát hiện nền tảng)
npx @aitytech/agentkits-memory
npx @aitytech/agentkits-memory setup --platform=cursor      # nền tảng cụ thể
npx @aitytech/agentkits-memory setup --platform=all          # tất cả nền tảng
npx @aitytech/agentkits-memory setup --force                 # cài đặt lại/cập nhật

# Khởi động MCP server
npx @aitytech/agentkits-memory server

# Giao diện web (cổng 1905)
npx @aitytech/agentkits-memory web

# Giao diện terminal
npx @aitytech/agentkits-memory viewer
npx @aitytech/agentkits-memory viewer --stats                # thống kê database
npx @aitytech/agentkits-memory viewer --json                 # đầu ra JSON

# Lưu từ CLI
npx @aitytech/agentkits-memory save "Use JWT with refresh tokens" --category pattern --tags auth,security

# Cài đặt
npx @aitytech/agentkits-memory hook settings .               # xem cài đặt hiện tại
npx @aitytech/agentkits-memory hook settings . --reset       # đặt lại về mặc định
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# Export / Import
npx @aitytech/agentkits-memory hook export . my-project ./backup.json
npx @aitytech/agentkits-memory hook import . ./backup.json

# Quản lý vòng đời
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30
npx @aitytech/agentkits-memory hook lifecycle-stats .
```

---

## Sử dụng Lập trình

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// Lưu trữ bộ nhớ
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// Truy vấn bộ nhớ
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// Lấy theo key
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## Hooks Tự động Thu thập

Hooks tự động ghi lại các phiên code AI của bạn (chỉ Claude Code và OpenCode):

| Hook | Kích hoạt | Hành động |
|------|---------|--------|
| `context` | Bắt đầu Phiên | Chèn ngữ cảnh phiên trước + trạng thái bộ nhớ |
| `session-init` | User Prompt | Khởi tạo/tiếp tục phiên, ghi lại prompts |
| `observation` | Sau Sử dụng Công cụ | Ghi lại sử dụng công cụ với phát hiện ý định |
| `summarize` | Kết thúc Phiên | Tạo tóm tắt phiên có cấu trúc |
| `user-message` | Bắt đầu Phiên | Hiển thị trạng thái bộ nhớ cho người dùng (stderr) |

Thiết lập hooks:
```bash
npx @aitytech/agentkits-memory
```

**Những gì được tự động ghi lại:**
- Đọc/ghi file với đường dẫn
- Thay đổi code dưới dạng diffs có cấu trúc (trước → sau)
- Ý định developer (bugfix, feature, refactor, investigation, v.v.)
- Tóm tắt phiên với quyết định, lỗi và bước tiếp theo
- Theo dõi nhiều prompt trong phiên

---

## Hỗ trợ Đa Nền tảng

| Nền tảng | MCP | Hooks | Rules File | Thiết lập |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ Đầy đủ | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ Đầy đủ | — | `--platform=opencode` |

- **MCP Server** hoạt động với tất cả nền tảng (công cụ bộ nhớ qua giao thức MCP)
- **Hooks** cung cấp tự động thu thập trên Claude Code và OpenCode
- **Rules files** dạy Cursor/Windsurf/Cline quy trình làm việc bộ nhớ
- **Dữ liệu bộ nhớ** luôn được lưu trong `.claude/memory/` (nguồn sự thật duy nhất)

---

## Workers Chạy Nền

Sau mỗi phiên, workers nền xử lý các tác vụ trong hàng đợi:

| Worker | Tác vụ | Mô tả |
|--------|------|-------------|
| `embed-session` | Embeddings | Tạo vector embeddings cho tìm kiếm ngữ nghĩa |
| `enrich-session` | Làm giàu AI | Làm giàu quan sát với tóm tắt, sự kiện, khái niệm do AI tạo |
| `compress-session` | Nén | Nén quan sát cũ (10:1–25:1) và tạo digest phiên (20:1–100:1) |

Workers chạy tự động sau khi kết thúc phiên. Mỗi worker:
- Xử lý tối đa 200 items mỗi lần chạy
- Sử dụng lock files để ngăn thực thi đồng thời
- Tự kết thúc sau 5 phút (ngăn zombie)
- Thử lại các tác vụ thất bại tối đa 3 lần

---

## Cấu hình AI Provider

Làm giàu AI sử dụng providers có thể thay thế. Mặc định là `claude-cli` (không cần API key).

| Provider | Kiểu | Mô hình Mặc định | Ghi chú |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | Sử dụng `claude --print`, không cần API key |
| **OpenAI** | `openai` | `gpt-4o-mini` | Bất kỳ mô hình OpenAI nào |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Google AI Studio key |
| **OpenRouter** | `openai` | bất kỳ | Đặt `baseUrl` thành `https://openrouter.ai/api/v1` |
| **GLM (Zhipu)** | `openai` | bất kỳ | Đặt `baseUrl` thành `https://open.bigmodel.cn/api/paas/v4` |
| **Ollama** | `openai` | bất kỳ | Đặt `baseUrl` thành `http://localhost:11434/v1` |

### Tùy chọn 1: Biến Môi trường

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (sử dụng định dạng tương thích OpenAI)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# Local Ollama (không cần API key)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# Tắt hoàn toàn làm giàu AI
export AGENTKITS_AI_ENRICHMENT=false
```

### Tùy chọn 2: Cài đặt Lâu dài

```bash
# Lưu vào .claude/memory/settings.json — tồn tại qua các phiên
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx @aitytech/agentkits-memory hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# Xem cài đặt hiện tại
npx @aitytech/agentkits-memory hook settings .

# Đặt lại về mặc định
npx @aitytech/agentkits-memory hook settings . --reset
```

> **Ưu tiên:** Biến môi trường ghi đè settings.json. Settings.json ghi đè mặc định.

---

## Quản lý Vòng đời

Quản lý tăng trưởng bộ nhớ theo thời gian:

```bash
# Nén quan sát cũ hơn 7 ngày, lưu trữ phiên cũ hơn 30 ngày
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30

# Cũng tự động xóa các phiên đã lưu trữ cũ hơn 90 ngày
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# Xem thống kê vòng đời
npx @aitytech/agentkits-memory hook lifecycle-stats .
```

| Giai đoạn | Điều gì Xảy ra |
|-------|-------------|
| **Nén** | AI nén quan sát, tạo digest phiên |
| **Lưu trữ** | Đánh dấu các phiên cũ là đã lưu trữ (loại khỏi ngữ cảnh) |
| **Xóa** | Xóa các phiên đã lưu trữ (opt-in, yêu cầu `--delete`) |

---

## Export / Import

Sao lưu và khôi phục bộ nhớ project của bạn:

```bash
# Export tất cả phiên cho một project
npx @aitytech/agentkits-memory hook export . my-project ./backup.json

# Import từ backup (tự động khử trùng)
npx @aitytech/agentkits-memory hook import . ./backup.json
```

Định dạng export bao gồm phiên, quan sát, prompts và tóm tắt.

---

## Danh mục Bộ nhớ

| Danh mục | Trường hợp Sử dụng |
|----------|----------|
| `decision` | Quyết định kiến trúc, lựa chọn tech stack, đánh đổi |
| `pattern` | Quy ước code, mẫu project, cách tiếp cận lặp lại |
| `error` | Sửa lỗi, giải pháp lỗi, insight debug |
| `context` | Bối cảnh project, quy ước nhóm, thiết lập môi trường |
| `observation` | Quan sát phiên tự động ghi lại |

---

## Lưu trữ

Bộ nhớ được lưu trữ trong `.claude/memory/` bên trong thư mục project của bạn.

```
.claude/memory/
├── memory.db          # Database SQLite (tất cả dữ liệu)
├── memory.db-wal      # Write-ahead log (tạm thời)
├── settings.json      # Cài đặt lâu dài (AI provider, cấu hình ngữ cảnh)
└── embeddings-cache/  # Vector embeddings đã cache
```

---

## Hỗ trợ Ngôn ngữ CJK

AgentKits Memory có **hỗ trợ CJK tự động** cho tìm kiếm văn bản tiếng Trung, Nhật và Hàn.

### Không cần Cấu hình

Khi `better-sqlite3` được cài đặt (mặc định), tìm kiếm CJK hoạt động tự động:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// Lưu trữ nội dung CJK
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// Tìm kiếm bằng tiếng Nhật, Trung hoặc Hàn - nó chỉ hoạt động!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### Cách hoạt động

- **SQLite gốc**: Sử dụng `better-sqlite3` cho hiệu suất tối đa
- **Trigram tokenizer**: FTS5 với trigram tạo chuỗi 3 ký tự cho khớp CJK
- **Fallback thông minh**: Truy vấn CJK ngắn (< 3 ký tự) tự động sử dụng tìm kiếm LIKE
- **BM25 ranking**: Chấm điểm mức độ liên quan cho kết quả tìm kiếm

### Nâng cao: Phân đoạn Từ Tiếng Nhật

Đối với tiếng Nhật nâng cao với phân đoạn từ đúng, tùy chọn sử dụng lindera:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

Yêu cầu build [lindera-sqlite](https://github.com/lindera/lindera-sqlite).

---

## Tham chiếu API

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // Mặc định: '.claude/memory'
  dbFilename: string;           // Mặc định: 'memory.db'
  enableVectorIndex: boolean;   // Mặc định: false
  dimensions: number;           // Mặc định: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // Mặc định: true
  cacheSize: number;            // Mặc định: 1000
  cacheTtl: number;             // Mặc định: 300000 (5 phút)
}
```

### Phương thức

| Phương thức | Mô tả |
|--------|-------------|
| `initialize()` | Khởi tạo dịch vụ bộ nhớ |
| `shutdown()` | Tắt và lưu trữ thay đổi |
| `storeEntry(input)` | Lưu trữ một entry bộ nhớ |
| `get(id)` | Lấy entry theo ID |
| `getByKey(namespace, key)` | Lấy entry theo namespace và key |
| `update(id, update)` | Cập nhật một entry |
| `delete(id)` | Xóa một entry |
| `query(query)` | Truy vấn entries với bộ lọc |
| `semanticSearch(content, k)` | Tìm kiếm độ tương đồng ngữ nghĩa |
| `count(namespace?)` | Đếm entries |
| `listNamespaces()` | Liệt kê tất cả namespaces |
| `getStats()` | Lấy thống kê |

---

## Chất lượng Mã nguồn

AgentKits Memory được kiểm thử kỹ lưỡng với **970 unit test** trên 21 test suite.

| Chỉ số | Độ phủ |
|--------|--------|
| **Câu lệnh** | 90.29% |
| **Nhánh** | 80.85% |
| **Hàm** | 90.54% |
| **Dòng** | 91.74% |

### Danh mục Test

| Danh mục | Số test | Nội dung kiểm thử |
|----------|---------|-------------------|
| Dịch vụ Bộ nhớ Core | 56 | CRUD, tìm kiếm, phân trang, danh mục, thẻ, nhập/xuất |
| Backend SQLite | 65 | Schema, migration, FTS5, transaction, xử lý lỗi |
| Chỉ mục Vector sqlite-vec | 47 | Chèn, tìm kiếm, xóa, lưu trữ, trường hợp biên |
| Tìm kiếm Hybrid | 44 | FTS + kết hợp vector, chấm điểm, xếp hạng, bộ lọc |
| Kinh tế Token | 27 | Ngân sách tìm kiếm 3 lớp, cắt ngắn, tối ưu hóa |
| Hệ thống Embedding | 63 | Bộ nhớ đệm, subprocess, mô hình cục bộ, hỗ trợ CJK |
| Hệ thống Hook | 502 | Context, khởi tạo session, observation, tóm tắt, làm giàu AI, vòng đời service, queue worker, adapter, type |
| Máy chủ MCP | 48 | 9 công cụ MCP, xác thực, phản hồi lỗi |
| CLI | 34 | Phát hiện nền tảng, tạo quy tắc |
| Tích hợp | 84 | Luồng end-to-end, tích hợp embedding, đa session |

```bash
# Chạy test
npm test

# Chạy với độ phủ
npm run test:coverage
```

---

## Yêu cầu

- **Node.js LTS**: 18.x, 20.x, hoặc 22.x (khuyến nghị)
- Trợ lý code AI tương thích MCP

### Ghi chú về Phiên bản Node.js

Package này sử dụng `better-sqlite3` yêu cầu binaries gốc. **Prebuilt binaries chỉ có sẵn cho các phiên bản LTS**.

| Phiên bản Node | Trạng thái | Ghi chú |
|--------------|--------|-------|
| 18.x LTS | ✅ Hoạt động | Prebuilt binaries |
| 20.x LTS | ✅ Hoạt động | Prebuilt binaries |
| 22.x LTS | ✅ Hoạt động | Prebuilt binaries |
| 19.x, 21.x, 23.x | ⚠️ Yêu cầu build tools | Không có prebuilt binaries |

### Sử dụng Phiên bản Không phải LTS (Windows)

Nếu bạn phải sử dụng phiên bản không phải LTS (19, 21, 23), cài đặt build tools trước:

**Tùy chọn 1: Visual Studio Build Tools**
```powershell
# Tải xuống và cài đặt từ:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Chọn workload "Desktop development with C++"
```

**Tùy chọn 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**Tùy chọn 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

Xem [node-gyp Windows guide](https://github.com/nodejs/node-gyp#on-windows) để biết thêm chi tiết.

---

## Hệ sinh thái AgentKits

**AgentKits Memory** là một phần của hệ sinh thái AgentKits của AityTech - các công cụ làm cho trợ lý code AI thông minh hơn.

| Sản phẩm | Mô tả | Link |
|---------|-------------|------|
| **AgentKits Engineer** | 28 agents chuyên biệt, 100+ skills, mẫu doanh nghiệp | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | Tạo nội dung marketing được hỗ trợ bởi AI | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | Bộ nhớ lâu dài cho trợ lý AI (package này) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## Lịch sử Star

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## Giấy phép

MIT

---

<p align="center">
  <strong>Trao cho trợ lý AI của bạn bộ nhớ tồn tại lâu dài.</strong>
</p>

<p align="center">
  <em>AgentKits Memory bởi AityTech</em>
</p>

<p align="center">
  Star repo này nếu nó giúp AI của bạn ghi nhớ.
</p>