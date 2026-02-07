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
  <strong>AI 코딩 어시스턴트를 위한 영구 메모리 시스템</strong>
</p>

<p align="center">
  AI 어시스턴트는 세션 간에 모든 것을 잊어버립니다. AgentKits Memory가 이를 해결합니다.<br>
  결정사항, 패턴, 오류, 컨텍스트 — MCP를 통해 로컬에 영구 저장됩니다.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">웹사이트</a> •
  <a href="https://www.agentkits.net/memory/docs">문서</a> •
  <a href="#빠른-시작">빠른 시작</a> •
  <a href="#작동-방식">작동 방식</a> •
  <a href="#멀티-플랫폼-지원">플랫폼</a> •
  <a href="#cli-명령어">CLI</a> •
  <a href="#웹-뷰어">웹 뷰어</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## 기능

| 기능 | 이점 |
|---------|---------|
| **100% 로컬** | 모든 데이터가 사용자 컴퓨터에 저장됩니다. 클라우드 없음, API 키 없음, 계정 없음 |
| **초고속** | 네이티브 SQLite (better-sqlite3) = 즉각적인 쿼리, 지연시간 제로 |
| **설정 불필요** | 별도 설정 없이 바로 작동합니다. 데이터베이스 설정 불필요 |
| **멀티 플랫폼** | Claude Code, Cursor, Windsurf, Cline, OpenCode — 한 번의 설정 명령 |
| **MCP 서버** | 9가지 도구: save, search, timeline, details, recall, list, update, delete, status |
| **자동 캡처** | 훅이 세션 컨텍스트, 도구 사용, 요약을 자동으로 캡처 |
| **AI 강화** | 백그라운드 워커가 AI 생성 요약으로 관찰 데이터 강화 |
| **벡터 검색** | 다국어 임베딩을 사용한 HNSW 의미적 유사성 (100개 이상 언어) |
| **웹 뷰어** | 브라우저 UI로 메모리 보기, 검색, 추가, 편집, 삭제 |
| **3계층 검색** | 점진적 노출로 모든 것을 가져오는 것보다 ~87% 토큰 절약 |
| **라이프사이클 관리** | 이전 세션 자동 압축, 아카이브, 정리 |
| **내보내기/가져오기** | JSON으로 메모리 백업 및 복원 |

---

## 작동 방식

```
세션 1: "인증에 JWT 사용"          세션 2: "로그인 엔드포인트 추가"
┌──────────────────────────┐          ┌──────────────────────────┐
│  AI와 코딩...            │          │  AI가 이미 알고 있음:    │
│  AI가 결정               │          │  ✓ JWT 인증 결정         │
│  AI가 오류 발견          │   ───►   │  ✓ 오류 해결책           │
│  AI가 패턴 학습          │  저장됨  │  ✓ 코드 패턴             │
│                          │          │  ✓ 세션 컨텍스트         │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% 로컬)
```

1. **한 번만 설정** — `npx @aitytech/agentkits-memory`이 플랫폼을 구성합니다
2. **자동 캡처** — 작업하는 동안 훅이 결정사항, 도구 사용, 요약을 기록합니다
3. **컨텍스트 주입** — 다음 세션이 이전 세션의 관련 이력으로 시작됩니다
4. **백그라운드 처리** — 워커가 AI로 관찰 데이터를 강화하고, 임베딩을 생성하며, 이전 데이터를 압축합니다
5. **언제든 검색** — AI가 MCP 도구(`memory_search` → `memory_details`)를 사용하여 과거 컨텍스트를 찾습니다

모든 데이터는 사용자 컴퓨터의 `.claude/memory/memory.db`에 저장됩니다. 클라우드 없음. API 키 불필요.

---

## 중요한 설계 결정

대부분의 메모리 도구는 데이터를 마크다운 파일에 분산 저장하거나, Python 런타임이 필요하거나, 코드를 외부 API로 전송합니다. AgentKits Memory는 근본적으로 다른 선택을 합니다:

| 설계 선택 | 중요한 이유 |
|---------------|----------------|
| **단일 SQLite 데이터베이스** | 하나의 파일(`memory.db`)이 모든 것을 보관 — 메모리, 세션, 관찰, 임베딩. 동기화할 분산 파일 없음, 병합 충돌 없음, 고아 데이터 없음. 백업 = 파일 하나만 복사 |
| **네이티브 Node.js, Python 제로** | Node가 실행되는 곳이면 어디서나 실행됩니다. conda 없음, pip 없음, virtualenv 없음. MCP 서버와 같은 언어 — `npx` 명령 하나로 완료 |
| **토큰 효율적인 3계층 검색** | 먼저 검색 인덱스(~50 토큰/결과), 그 다음 타임라인 컨텍스트, 마지막으로 전체 세부사항. 필요한 것만 가져옵니다. 다른 도구는 전체 메모리 파일을 컨텍스트에 덤프하여 무관한 콘텐츠에 토큰을 낭비합니다 |
| **훅을 통한 자동 캡처** | 결정사항, 패턴, 오류가 발생하는 즉시 기록됩니다 — 저장을 기억한 후가 아닙니다. 세션 컨텍스트 주입은 다음 세션 시작 시 자동으로 발생합니다 |
| **로컬 임베딩, API 호출 없음** | 벡터 검색은 로컬 ONNX 모델(multilingual-e5-small)을 사용합니다. 의미 검색이 오프라인에서 작동하고, 비용이 없으며, 100개 이상의 언어를 지원합니다 |
| **백그라운드 워커** | AI 강화, 임베딩 생성, 압축이 비동기적으로 실행됩니다. 코딩 흐름이 결코 차단되지 않습니다 |
| **처음부터 멀티 플랫폼** | `--platform=all` 플래그 하나로 Claude Code, Cursor, Windsurf, Cline, OpenCode를 동시에 구성합니다. 동일한 메모리 데이터베이스, 다른 에디터 |
| **구조화된 관찰 데이터** | 도구 사용이 유형 분류(read/write/execute/search), 파일 추적, 의도 감지, AI 생성 내러티브와 함께 캡처됩니다 — 원시 텍스트 덤프가 아닙니다 |
| **프로세스 누수 없음** | 백그라운드 워커는 5분 후 자동 종료되며, PID 기반 잠금 파일을 사용하고 오래된 잠금 정리와 SIGTERM/SIGINT를 우아하게 처리합니다. 좀비 프로세스 없음, 고아 워커 없음 |
| **메모리 누수 없음** | 훅은 단기 프로세스로 실행됩니다(장기 실행 데몬이 아님). 데이터베이스 연결은 종료 시 닫힙니다. 임베딩 서브프로세스는 제한된 재시작(최대 2회), 대기 중인 요청 타임아웃, 모든 타이머와 큐의 우아한 정리를 갖습니다 |

---

## 웹 뷰어

최신 웹 인터페이스를 통해 메모리를 보고 관리하세요.

```bash
npx @aitytech/agentkits-memory web
```

그런 다음 브라우저에서 **http://localhost:1905**를 엽니다.

### 세션 목록

타임라인 뷰와 활동 세부사항으로 모든 세션을 탐색합니다.

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### 메모리 목록

검색 및 네임스페이스 필터링으로 저장된 모든 메모리를 탐색합니다.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### 메모리 추가

키, 네임스페이스, 유형, 콘텐츠, 태그로 새 메모리를 생성합니다.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### 메모리 세부사항

편집 및 삭제 옵션과 함께 전체 메모리 세부사항을 봅니다.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### 임베딩 관리

의미 검색을 위한 벡터 임베딩을 생성하고 관리합니다.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## 빠른 시작

### 옵션 1: Claude Code 플러그인 마켓플레이스 (Claude Code 권장)

하나의 명령으로 설치 — 수동 구성 불필요:

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@agentkits-memory
```

훅, MCP 서버, 메모리 워크플로 스킬이 자동으로 설치됩니다. 설치 후 Claude Code를 재시작하세요.

### 옵션 2: 자동 설정 (모든 플랫폼)

```bash
npx @aitytech/agentkits-memory
```

플랫폼을 자동 감지하고 모든 것을 구성합니다: MCP 서버, 훅(Claude Code/OpenCode), 규칙 파일(Cursor/Windsurf/Cline), 임베딩 모델 다운로드.

**특정 플랫폼 대상 지정:**

```bash
npx @aitytech/agentkits-memory setup --platform=cursor
npx @aitytech/agentkits-memory setup --platform=windsurf,cline
npx @aitytech/agentkits-memory setup --platform=all
```

### 옵션 3: 수동 MCP 구성

수동 설정을 선호하는 경우, MCP 구성에 추가하세요:

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

구성 파일 위치:
- **Claude Code**: `.claude/settings.json` (`mcpServers` 키에 포함)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (프로젝트 루트)

### 3. MCP 도구

구성 후, AI 어시스턴트가 다음 도구를 사용할 수 있습니다:

| 도구 | 설명 |
|------|-------------|
| `memory_status` | 메모리 시스템 상태 확인 (먼저 호출!) |
| `memory_save` | 결정사항, 패턴, 오류 또는 컨텍스트 저장 |
| `memory_search` | **[1단계]** 검색 인덱스 — 경량 ID + 제목 (~50 토큰/결과) |
| `memory_timeline` | **[2단계]** 메모리 주변의 시간적 컨텍스트 가져오기 |
| `memory_details` | **[3단계]** 특정 ID의 전체 콘텐츠 가져오기 |
| `memory_recall` | 빠른 주제 개요 — 그룹화된 요약 |
| `memory_list` | 최근 메모리 나열 |
| `memory_update` | 기존 메모리 콘텐츠 또는 태그 업데이트 |
| `memory_delete` | 오래된 메모리 제거 |

---

## 점진적 노출 (토큰 효율적 검색)

AgentKits Memory는 전체 콘텐츠를 미리 가져오는 것보다 ~70% 토큰을 절약하는 **3계층 검색 패턴**을 사용합니다.

### 작동 방식

```
┌─────────────────────────────────────────────────────────────┐
│  1단계: memory_search                                       │
│  반환: ID, 제목, 태그, 점수 (~50 토큰/항목)                │
│  → 인덱스 검토, 관련 메모리 선택                           │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  2단계: memory_timeline (선택사항)                          │
│  반환: 메모리 주변 ±30분 컨텍스트                          │
│  → 전후에 무슨 일이 일어났는지 이해                        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  3단계: memory_details                                      │
│  반환: 선택한 ID의 전체 콘텐츠만                           │
│  → 실제로 필요한 것만 가져오기                             │
└─────────────────────────────────────────────────────────────┘
```

### 예제 워크플로

```typescript
// 1단계: 검색 - 경량 인덱스 가져오기
memory_search({ query: "authentication" })
// → 반환: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// 2단계: (선택사항) 시간적 컨텍스트 보기
memory_timeline({ anchor: "abc" })
// → 반환: 이 메모리 전후에 무슨 일이 일어났는지

// 3단계: 필요한 것만 전체 콘텐츠 가져오기
memory_details({ ids: ["abc"] })
// → 반환: 선택한 메모리의 전체 콘텐츠
```

### 토큰 절약

| 접근 방식 | 사용된 토큰 |
|----------|-------------|
| **기존:** 모든 콘텐츠 가져오기 | ~500 토큰 × 10 결과 = 5000 토큰 |
| **신규:** 점진적 노출 | 50 × 10 + 500 × 2 = 1500 토큰 |
| **절약** | **70% 감소** |

---

## CLI 명령어

```bash
# 한 번의 명령으로 설정 (플랫폼 자동 감지)
npx @aitytech/agentkits-memory
npx @aitytech/agentkits-memory setup --platform=cursor      # 특정 플랫폼
npx @aitytech/agentkits-memory setup --platform=all          # 모든 플랫폼
npx @aitytech/agentkits-memory setup --force                 # 재설치/업데이트

# MCP 서버 시작
npx @aitytech/agentkits-memory server

# 웹 뷰어 (포트 1905)
npx @aitytech/agentkits-memory web

# 터미널 뷰어
npx @aitytech/agentkits-memory viewer
npx @aitytech/agentkits-memory viewer --stats                # 데이터베이스 통계
npx @aitytech/agentkits-memory viewer --json                 # JSON 출력

# CLI에서 저장
npx @aitytech/agentkits-memory save "Use JWT with refresh tokens" --category pattern --tags auth,security

# 설정
npx @aitytech/agentkits-memory hook settings .               # 현재 설정 보기
npx @aitytech/agentkits-memory hook settings . --reset       # 기본값으로 재설정
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# 내보내기 / 가져오기
npx @aitytech/agentkits-memory hook export . my-project ./backup.json
npx @aitytech/agentkits-memory hook import . ./backup.json

# 라이프사이클 관리
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30
npx @aitytech/agentkits-memory hook lifecycle-stats .
```

---

## 프로그래밍 방식 사용

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// 메모리 저장
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// 메모리 쿼리
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// 키로 가져오기
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## 자동 캡처 훅

훅이 AI 코딩 세션을 자동으로 캡처합니다(Claude Code 및 OpenCode만):

| 훅 | 트리거 | 동작 |
|------|---------|--------|
| `context` | 세션 시작 | 이전 세션 컨텍스트 + 메모리 상태 주입 |
| `session-init` | 사용자 프롬프트 | 세션 초기화/재개, 프롬프트 기록 |
| `observation` | 도구 사용 후 | 의도 감지와 함께 도구 사용 캡처 |
| `summarize` | 세션 종료 | 구조화된 세션 요약 생성 |
| `user-message` | 세션 시작 | 사용자에게 메모리 상태 표시 (stderr) |

훅 설정:
```bash
npx @aitytech/agentkits-memory
```

**자동으로 캡처되는 내용:**
- 경로가 있는 파일 읽기/쓰기
- 구조화된 차이로서의 코드 변경 (이전 → 이후)
- 개발자 의도 (bugfix, feature, refactor, investigation 등)
- 결정사항, 오류, 다음 단계가 있는 세션 요약
- 세션 내 다중 프롬프트 추적

---

## 멀티 플랫폼 지원

| 플랫폼 | MCP | 훅 | 규칙 파일 | 설정 |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ 전체 | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ 전체 | — | `--platform=opencode` |

- **MCP 서버**는 모든 플랫폼에서 작동 (MCP 프로토콜을 통한 메모리 도구)
- **훅**은 Claude Code 및 OpenCode에서 자동 캡처 제공
- **규칙 파일**은 Cursor/Windsurf/Cline에게 메모리 워크플로를 가르침
- **메모리 데이터**는 항상 `.claude/memory/`에 저장 (단일 진실의 원천)

---

## 백그라운드 워커

각 세션 후, 백그라운드 워커가 대기 중인 작업을 처리합니다:

| 워커 | 작업 | 설명 |
|--------|------|-------------|
| `embed-session` | 임베딩 | 의미 검색을 위한 벡터 임베딩 생성 |
| `enrich-session` | AI 강화 | AI 생성 요약, 사실, 개념으로 관찰 데이터 강화 |
| `compress-session` | 압축 | 이전 관찰 압축 (10:1–25:1) 및 세션 다이제스트 생성 (20:1–100:1) |

워커는 세션 종료 후 자동으로 실행됩니다. 각 워커는:
- 실행당 최대 200개 항목 처리
- 동시 실행을 방지하기 위해 잠금 파일 사용
- 5분 후 자동 종료 (좀비 방지)
- 실패한 작업을 최대 3회 재시도

---

## AI 제공자 구성

AI 강화는 플러그형 제공자를 사용합니다. 기본값은 `claude-cli` (API 키 불필요).

| 제공자 | 유형 | 기본 모델 | 참고 |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | `claude --print` 사용, API 키 불필요 |
| **OpenAI** | `openai` | `gpt-4o-mini` | 모든 OpenAI 모델 |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Google AI Studio 키 |
| **OpenRouter** | `openai` | any | `baseUrl`을 `https://openrouter.ai/api/v1`로 설정 |
| **GLM (Zhipu)** | `openai` | any | `baseUrl`을 `https://open.bigmodel.cn/api/paas/v4`로 설정 |
| **Ollama** | `openai` | any | `baseUrl`을 `http://localhost:11434/v1`로 설정 |

### 옵션 1: 환경 변수

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (OpenAI 호환 형식 사용)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# 로컬 Ollama (API 키 불필요)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# AI 강화 완전히 비활성화
export AGENTKITS_AI_ENRICHMENT=false
```

### 옵션 2: 영구 설정

```bash
# .claude/memory/settings.json에 저장됨 — 세션 간 유지
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx @aitytech/agentkits-memory hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx @aitytech/agentkits-memory hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# 현재 설정 보기
npx @aitytech/agentkits-memory hook settings .

# 기본값으로 재설정
npx @aitytech/agentkits-memory hook settings . --reset
```

> **우선순위:** 환경 변수가 settings.json을 재정의합니다. settings.json이 기본값을 재정의합니다.

---

## 라이프사이클 관리

시간 경과에 따른 메모리 증가 관리:

```bash
# 7일 이상 된 관찰 압축, 30일 이상 된 세션 아카이브
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30

# 90일 이상 된 아카이브된 세션도 자동 삭제
npx @aitytech/agentkits-memory hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# 라이프사이클 통계 보기
npx @aitytech/agentkits-memory hook lifecycle-stats .
```

| 단계 | 수행되는 작업 |
|-------|-------------|
| **압축** | AI가 관찰을 압축하고, 세션 다이제스트 생성 |
| **아카이브** | 이전 세션을 아카이브로 표시 (컨텍스트에서 제외) |
| **삭제** | 아카이브된 세션 제거 (옵트인, `--delete` 필요) |

---

## 내보내기 / 가져오기

프로젝트 메모리 백업 및 복원:

```bash
# 프로젝트의 모든 세션 내보내기
npx @aitytech/agentkits-memory hook export . my-project ./backup.json

# 백업에서 가져오기 (자동 중복 제거)
npx @aitytech/agentkits-memory hook import . ./backup.json
```

내보내기 형식에는 세션, 관찰, 프롬프트, 요약이 포함됩니다.

---

## 메모리 카테고리

| 카테고리 | 사용 사례 |
|----------|----------|
| `decision` | 아키텍처 결정, 기술 스택 선택, 트레이드오프 |
| `pattern` | 코딩 규칙, 프로젝트 패턴, 반복되는 접근 방식 |
| `error` | 버그 수정, 오류 해결책, 디버깅 인사이트 |
| `context` | 프로젝트 배경, 팀 규칙, 환경 설정 |
| `observation` | 자동 캡처된 세션 관찰 |

---

## 저장소

메모리는 프로젝트 디렉토리 내 `.claude/memory/`에 저장됩니다.

```
.claude/memory/
├── memory.db          # SQLite 데이터베이스 (모든 데이터)
├── memory.db-wal      # Write-ahead log (임시)
├── settings.json      # 영구 설정 (AI 제공자, 컨텍스트 구성)
└── embeddings-cache/  # 캐시된 벡터 임베딩
```

---

## CJK 언어 지원

AgentKits Memory는 중국어, 일본어, 한국어 텍스트 검색을 위한 **자동 CJK 지원**을 제공합니다.

### 설정 불필요

`better-sqlite3`이 설치되면 (기본값), CJK 검색이 자동으로 작동합니다:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// CJK 콘텐츠 저장
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// 일본어, 중국어, 한국어로 검색 - 바로 작동합니다!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### 작동 방식

- **네이티브 SQLite**: 최대 성능을 위해 `better-sqlite3` 사용
- **트라이그램 토크나이저**: FTS5가 트라이그램으로 CJK 매칭을 위한 3문자 시퀀스 생성
- **스마트 폴백**: 짧은 CJK 쿼리(< 3자)는 자동으로 LIKE 검색 사용
- **BM25 순위**: 검색 결과에 대한 관련성 점수

### 고급: 일본어 단어 분할

적절한 단어 분할을 사용한 고급 일본어의 경우, 선택적으로 lindera를 사용하세요:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

[lindera-sqlite](https://github.com/lindera/lindera-sqlite) 빌드가 필요합니다.

---

## API 참조

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // 기본값: '.claude/memory'
  dbFilename: string;           // 기본값: 'memory.db'
  enableVectorIndex: boolean;   // 기본값: false
  dimensions: number;           // 기본값: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // 기본값: true
  cacheSize: number;            // 기본값: 1000
  cacheTtl: number;             // 기본값: 300000 (5분)
}
```

### 메서드

| 메서드 | 설명 |
|--------|-------------|
| `initialize()` | 메모리 서비스 초기화 |
| `shutdown()` | 종료 및 변경사항 유지 |
| `storeEntry(input)` | 메모리 항목 저장 |
| `get(id)` | ID로 항목 가져오기 |
| `getByKey(namespace, key)` | 네임스페이스와 키로 항목 가져오기 |
| `update(id, update)` | 항목 업데이트 |
| `delete(id)` | 항목 삭제 |
| `query(query)` | 필터로 항목 쿼리 |
| `semanticSearch(content, k)` | 의미적 유사성 검색 |
| `count(namespace?)` | 항목 수 세기 |
| `listNamespaces()` | 모든 네임스페이스 나열 |
| `getStats()` | 통계 가져오기 |

---

## 코드 품질

AgentKits Memory는 21개의 테스트 스위트에 걸쳐 **970개의 단위 테스트**로 철저하게 테스트되었습니다.

| 지표 | 커버리지 |
|------|---------|
| **구문** | 90.29% |
| **분기** | 80.85% |
| **함수** | 90.54% |
| **라인** | 91.74% |

### 테스트 카테고리

| 카테고리 | 테스트 수 | 커버 내용 |
|----------|---------|----------|
| 코어 메모리 서비스 | 56 | CRUD, 검색, 페이지네이션, 카테고리, 태그, 가져오기/내보내기 |
| SQLite 백엔드 | 65 | 스키마, 마이그레이션, FTS5, 트랜잭션, 오류 처리 |
| HNSW 벡터 인덱스 | 47 | 삽입, 검색, 삭제, 영속성, 엣지 케이스 |
| 하이브리드 검색 | 44 | FTS + 벡터 융합, 스코어링, 랭킹, 필터 |
| 토큰 이코노믹스 | 27 | 3계층 검색 예산, 절삭, 최적화 |
| 임베딩 시스템 | 63 | 캐시, 서브프로세스, 로컬 모델, CJK 지원 |
| 훅 시스템 | 502 | 컨텍스트, 세션 초기화, 관찰, 요약, AI 강화, 서비스 라이프사이클, 큐 워커, 어댑터, 타입 |
| MCP 서버 | 48 | 전체 9개 MCP 도구, 유효성 검사, 오류 응답 |
| CLI | 34 | 플랫폼 감지, 규칙 생성 |
| 통합 테스트 | 84 | 엔드투엔드 플로우, 임베딩 통합, 멀티 세션 |

```bash
# 테스트 실행
npm test

# 커버리지 포함 테스트
npm run test:coverage
```

---

## 요구 사항

- **Node.js LTS**: 18.x, 20.x, 또는 22.x (권장)
- MCP 호환 AI 코딩 어시스턴트

### Node.js 버전 참고사항

이 패키지는 네이티브 바이너리가 필요한 `better-sqlite3`을 사용합니다. **사전 빌드된 바이너리는 LTS 버전에서만 사용 가능합니다**.

| Node 버전 | 상태 | 참고 |
|--------------|--------|-------|
| 18.x LTS | ✅ 작동 | 사전 빌드된 바이너리 |
| 20.x LTS | ✅ 작동 | 사전 빌드된 바이너리 |
| 22.x LTS | ✅ 작동 | 사전 빌드된 바이너리 |
| 19.x, 21.x, 23.x | ⚠️ 빌드 도구 필요 | 사전 빌드된 바이너리 없음 |

### 비-LTS 버전 사용 (Windows)

비-LTS 버전(19, 21, 23)을 사용해야 하는 경우, 먼저 빌드 도구를 설치하세요:

**옵션 1: Visual Studio Build Tools**
```powershell
# 다음에서 다운로드 및 설치:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# "Desktop development with C++" 워크로드 선택
```

**옵션 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**옵션 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

자세한 내용은 [node-gyp Windows 가이드](https://github.com/nodejs/node-gyp#on-windows)를 참조하세요.

---

## AgentKits 생태계

**AgentKits Memory**는 AityTech의 AgentKits 생태계의 일부입니다 - AI 코딩 어시스턴트를 더 스마트하게 만드는 도구입니다.

| 제품 | 설명 | 링크 |
|---------|-------------|------|
| **AgentKits Engineer** | 28개의 특화 에이전트, 100개 이상의 스킬, 엔터프라이즈 패턴 | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | AI 기반 마케팅 콘텐츠 생성 | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | AI 어시스턴트를 위한 영구 메모리 (이 패키지) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## Star History

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## 라이선스

MIT

---

<p align="center">
  <strong>AI 어시스턴트에게 지속되는 메모리를 부여하세요.</strong>
</p>

<p align="center">
  <em>AgentKits Memory by AityTech</em>
</p>

<p align="center">
  도움이 되셨다면 이 저장소에 스타를 주세요.
</p>