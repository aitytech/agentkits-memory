<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>von <strong>AityTech</strong></em>
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
  <strong>Persistentes Speichersystem für KI-Coding-Assistenten</strong>
</p>

<p align="center">
  Ihr KI-Assistent vergisst zwischen Sessions alles. AgentKits Memory behebt das.<br>
  Entscheidungen, Muster, Fehler und Kontext — alles lokal über MCP gespeichert.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">Webseite</a> •
  <a href="https://www.agentkits.net/memory/docs">Dokumentation</a> •
  <a href="#schnellstart">Schnellstart</a> •
  <a href="#so-funktioniert-es">So funktioniert es</a> •
  <a href="#multi-plattform-unterstützung">Plattformen</a> •
  <a href="#cli-befehle">CLI</a> •
  <a href="#web-viewer">Web Viewer</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <strong>Deutsch</strong> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## Features

| Feature | Vorteil |
|---------|---------|
| **100% Lokal** | Alle Daten bleiben auf Ihrem Rechner. Keine Cloud, keine API-Keys, keine Accounts |
| **Blitzschnell** | Native SQLite (better-sqlite3) = sofortige Abfragen, null Latenz |
| **Null Konfiguration** | Funktioniert out of the box. Keine Datenbank-Einrichtung erforderlich |
| **Multi-Plattform** | Claude Code, Cursor, Windsurf, Cline, OpenCode — ein Setup-Befehl |
| **MCP Server** | 9 Tools: save, search, timeline, details, recall, list, update, delete, status |
| **Auto-Capture** | Hooks erfassen Session-Kontext, Tool-Nutzung, Zusammenfassungen automatisch |
| **KI-Anreicherung** | Background-Worker reichern Beobachtungen mit KI-generierten Zusammenfassungen an |
| **Vektorsuche** | HNSW semantische Ähnlichkeit mit mehrsprachigen Embeddings (100+ Sprachen) |
| **Web Viewer** | Browser-UI zum Anzeigen, Suchen, Hinzufügen, Bearbeiten, Löschen von Erinnerungen |
| **3-Schicht-Suche** | Progressive Disclosure spart ~87% Tokens vs. alles abrufen |
| **Lifecycle-Mgmt** | Auto-Komprimierung, Archivierung und Bereinigung alter Sessions |
| **Export/Import** | Backup und Wiederherstellung von Erinnerungen als JSON |

---

## So funktioniert es

```
Session 1: "Use JWT for auth"          Session 2: "Add login endpoint"
┌──────────────────────────┐          ┌──────────────────────────┐
│  Sie coden mit KI...     │          │  KI weiß bereits:        │
│  KI trifft Entscheidungen│          │  ✓ JWT-Auth-Entscheidung │
│  KI begegnet Fehlern     │   ───►   │  ✓ Fehlerlösungen        │
│  KI lernt Muster         │ gespeich.│  ✓ Code-Muster           │
│                          │          │  ✓ Session-Kontext       │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite, 100% lokal)
```

1. **Einmal einrichten** — `npx agentkits-memory-setup` konfiguriert Ihre Plattform
2. **Auto-Capture** — Hooks zeichnen Entscheidungen, Tool-Nutzung und Zusammenfassungen während der Arbeit auf
3. **Kontext-Injektion** — Nächste Session startet mit relevantem Verlauf aus vergangenen Sessions
4. **Hintergrundverarbeitung** — Worker reichern Beobachtungen mit KI an, generieren Embeddings, komprimieren alte Daten
5. **Jederzeit suchen** — KI verwendet MCP-Tools (`memory_search` → `memory_details`), um vergangenen Kontext zu finden

Alle Daten bleiben in `.claude/memory/memory.db` auf Ihrem Rechner. Keine Cloud. Keine API-Keys erforderlich.

---

## Design-Entscheidungen, die zählen

Die meisten Memory-Tools verstreuen Daten über Markdown-Dateien, benötigen Python-Laufzeiten oder senden Ihren Code an externe APIs. AgentKits Memory trifft grundlegend andere Entscheidungen:

| Design-Entscheidung | Warum es wichtig ist |
|---------------------|----------------------|
| **Einzelne SQLite-Datenbank** | Eine Datei (`memory.db`) enthält alles — Erinnerungen, Sessions, Beobachtungen, Embeddings. Keine verstreuten Dateien zum Synchronisieren, keine Merge-Konflikte, keine verwaisten Daten. Backup = eine Datei kopieren |
| **Native Node.js, null Python** | Läuft überall, wo Node läuft. Kein conda, kein pip, kein virtualenv. Gleiche Sprache wie Ihr MCP-Server — ein `npx`-Befehl, fertig |
| **Token-effiziente 3-Schicht-Suche** | Erst Suchindex (~50 Tokens/Ergebnis), dann Timeline-Kontext, dann vollständige Details. Nur abrufen, was Sie brauchen. Andere Tools werfen ganze Memory-Dateien in den Kontext und verschwenden Tokens für irrelevante Inhalte |
| **Auto-Capture über Hooks** | Entscheidungen, Muster und Fehler werden aufgezeichnet, während sie passieren — nicht nachdem Sie sich daran erinnert haben, sie zu speichern. Session-Kontext-Injektion erfolgt automatisch beim nächsten Session-Start |
| **Lokale Embeddings, keine API-Aufrufe** | Vektorsuche verwendet ein lokales ONNX-Modell (multilingual-e5-small). Semantische Suche funktioniert offline, kostet nichts und unterstützt 100+ Sprachen |
| **Background-Worker** | KI-Anreicherung, Embedding-Generierung und Komprimierung laufen asynchron. Ihr Coding-Flow wird nie blockiert |
| **Multi-Plattform von Tag eins** | Ein `--platform=all`-Flag konfiguriert Claude Code, Cursor, Windsurf, Cline und OpenCode gleichzeitig. Gleiche Memory-Datenbank, verschiedene Editoren |
| **Strukturierte Beobachtungsdaten** | Tool-Nutzung wird mit Typ-Klassifizierung (read/write/execute/search), Datei-Tracking, Intent-Erkennung und KI-generierten Narrativen erfasst — keine rohen Text-Dumps |
| **Keine Process-Leaks** | Background-Worker beenden sich nach 5 Minuten selbst, verwenden PID-basierte Lock-Dateien mit Stale-Lock-Cleanup und handhaben SIGTERM/SIGINT ordentlich. Keine Zombie-Prozesse, keine verwaisten Worker |
| **Keine Memory-Leaks** | Hooks laufen als kurzlebige Prozesse (nicht lang laufende Daemons). Datenbankverbindungen schließen beim Shutdown. Embedding-Subprocess hat begrenztes Respawn (max 2), Pending-Request-Timeouts und ordentliches Cleanup aller Timer und Queues |

---

## Web Viewer

Zeigen Sie Ihre Erinnerungen über eine moderne Web-Oberfläche an und verwalten Sie sie.

```bash
npx agentkits-memory-web
```

Öffnen Sie dann **http://localhost:1905** in Ihrem Browser.

### Sitzungsliste

Durchsuchen Sie alle Sitzungen mit Zeitleistenansicht und Aktivitätsdetails.

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### Memory-Liste

Durchsuchen Sie alle gespeicherten Erinnerungen mit Such- und Namespace-Filterung.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### Erinnerung hinzufügen

Erstellen Sie neue Erinnerungen mit Key, Namespace, Typ, Inhalt und Tags.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### Memory-Details

Zeigen Sie vollständige Memory-Details mit Bearbeitungs- und Löschoptionen an.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### Embeddings verwalten

Generieren und verwalten Sie Vektor-Embeddings für semantische Suche.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## Schnellstart

### Option 1: Claude Code Plugin-Marketplace (Empfohlen für Claude Code)

Mit einem Befehl installieren — keine manuelle Konfiguration nötig:

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@aitytech
```

Dies installiert Hooks, MCP-Server und Memory-Workflow-Skill automatisch. Starten Sie Claude Code nach der Installation neu.

### Option 2: Automatisches Setup (Alle Plattformen)

```bash
npx agentkits-memory-setup
```

Dies erkennt Ihre Plattform automatisch und konfiguriert alles: MCP-Server, Hooks (Claude Code/OpenCode), Rules-Dateien (Cursor/Windsurf/Cline) und lädt das Embedding-Modell herunter.

**Spezifische Plattform auswählen:**

```bash
npx agentkits-memory-setup --platform=cursor
npx agentkits-memory-setup --platform=windsurf,cline
npx agentkits-memory-setup --platform=all
```

### Option 3: Manuelle MCP-Konfiguration

Wenn Sie manuelle Einrichtung bevorzugen, fügen Sie zu Ihrer MCP-Konfiguration hinzu:

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

Speicherorte der Config-Dateien:
- **Claude Code**: `.claude/settings.json` (eingebettet im `mcpServers`-Key)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (Projektstamm)

### 3. MCP-Tools

Sobald konfiguriert, kann Ihr KI-Assistent diese Tools verwenden:

| Tool | Beschreibung |
|------|--------------|
| `memory_status` | Memory-System-Status prüfen (zuerst aufrufen!) |
| `memory_save` | Entscheidungen, Muster, Fehler oder Kontext speichern |
| `memory_search` | **[Schritt 1]** Suchindex durchsuchen — leichtgewichtige IDs + Titel (~50 Tokens/Ergebnis) |
| `memory_timeline` | **[Schritt 2]** Temporalen Kontext um eine Erinnerung abrufen |
| `memory_details` | **[Schritt 3]** Vollständigen Inhalt für bestimmte IDs abrufen |
| `memory_recall` | Schnelle Themenübersicht — gruppierte Zusammenfassung |
| `memory_list` | Aktuelle Erinnerungen auflisten |
| `memory_update` | Vorhandenen Memory-Inhalt oder Tags aktualisieren |
| `memory_delete` | Veraltete Erinnerungen entfernen |

---

## Progressive Disclosure (Token-effiziente Suche)

AgentKits Memory verwendet ein **3-Schicht-Suchmuster**, das ~70% Tokens spart im Vergleich zum sofortigen Abrufen vollständiger Inhalte.

### So funktioniert es

```
┌─────────────────────────────────────────────────────────────┐
│  Schritt 1: memory_search                                   │
│  Gibt zurück: IDs, Titel, Tags, Scores (~50 Tokens/Element) │
│  → Index durchsehen, relevante Erinnerungen auswählen       │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Schritt 2: memory_timeline (optional)                      │
│  Gibt zurück: Kontext ±30 Minuten um Erinnerung            │
│  → Verstehen, was vorher/nachher passiert ist               │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Schritt 3: memory_details                                  │
│  Gibt zurück: Vollständiger Inhalt nur für ausgewählte IDs  │
│  → Nur abrufen, was Sie tatsächlich brauchen                │
└─────────────────────────────────────────────────────────────┘
```

### Beispiel-Workflow

```typescript
// Schritt 1: Suchen - leichtgewichtigen Index abrufen
memory_search({ query: "authentication" })
// → Gibt zurück: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// Schritt 2: (Optional) Temporalen Kontext sehen
memory_timeline({ anchor: "abc" })
// → Gibt zurück: Was vor/nach dieser Erinnerung passiert ist

// Schritt 3: Vollständigen Inhalt nur für das Benötigte abrufen
memory_details({ ids: ["abc"] })
// → Gibt zurück: Vollständiger Inhalt für ausgewählte Erinnerung
```

### Token-Einsparungen

| Ansatz | Verwendete Tokens |
|--------|-------------------|
| **Alt:** Alle Inhalte abrufen | ~500 Tokens × 10 Ergebnisse = 5000 Tokens |
| **Neu:** Progressive Disclosure | 50 × 10 + 500 × 2 = 1500 Tokens |
| **Einsparung** | **70% Reduzierung** |

---

## CLI-Befehle

```bash
# Ein-Befehl-Setup (erkennt Plattform automatisch)
npx agentkits-memory-setup
npx agentkits-memory-setup --platform=cursor      # spezifische Plattform
npx agentkits-memory-setup --platform=all          # alle Plattformen
npx agentkits-memory-setup --force                 # neu installieren/aktualisieren

# MCP-Server starten
npx agentkits-memory-server

# Web Viewer (Port 1905)
npx agentkits-memory-web

# Terminal-Viewer
npx agentkits-memory-viewer
npx agentkits-memory-viewer --stats                # Datenbankstatistiken
npx agentkits-memory-viewer --json                 # JSON-Ausgabe

# Aus CLI speichern
npx agentkits-memory-save "Use JWT with refresh tokens" --category pattern --tags auth,security

# Einstellungen
npx agentkits-memory-hook settings .               # aktuelle Einstellungen anzeigen
npx agentkits-memory-hook settings . --reset       # auf Standard zurücksetzen
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# Export / Import
npx agentkits-memory-hook export . my-project ./backup.json
npx agentkits-memory-hook import . ./backup.json

# Lifecycle-Management
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30
npx agentkits-memory-hook lifecycle-stats .
```

---

## Programmatische Verwendung

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// Eine Erinnerung speichern
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// Erinnerungen abfragen
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// Nach Key abrufen
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## Auto-Capture-Hooks

Hooks erfassen Ihre KI-Coding-Sessions automatisch (nur Claude Code und OpenCode):

| Hook | Auslöser | Aktion |
|------|----------|--------|
| `context` | Session-Start | Injiziert vorherigen Session-Kontext + Memory-Status |
| `session-init` | User Prompt | Initialisiert/setzt Session fort, zeichnet Prompts auf |
| `observation` | Nach Tool-Nutzung | Erfasst Tool-Nutzung mit Intent-Erkennung |
| `summarize` | Session-Ende | Generiert strukturierte Session-Zusammenfassung |
| `user-message` | Session-Start | Zeigt Memory-Status dem Benutzer an (stderr) |

Hooks einrichten:
```bash
npx agentkits-memory-setup
```

**Was automatisch erfasst wird:**
- Datei-Reads/Writes mit Pfaden
- Code-Änderungen als strukturierte Diffs (vorher → nachher)
- Entwickler-Intent (Bugfix, Feature, Refactoring, Investigation, etc.)
- Session-Zusammenfassungen mit Entscheidungen, Fehlern und nächsten Schritten
- Multi-Prompt-Tracking innerhalb von Sessions

---

## Multi-Plattform-Unterstützung

| Plattform | MCP | Hooks | Rules-Datei | Setup |
|-----------|-----|-------|-------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ Voll | CLAUDE.md (skill) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ Voll | — | `--platform=opencode` |

- **MCP Server** funktioniert mit allen Plattformen (Memory-Tools über MCP-Protokoll)
- **Hooks** bieten Auto-Capture auf Claude Code und OpenCode
- **Rules-Dateien** lehren Cursor/Windsurf/Cline den Memory-Workflow
- **Memory-Daten** immer in `.claude/memory/` gespeichert (Single Source of Truth)

---

## Background-Worker

Nach jeder Session verarbeiten Background-Worker Aufgaben in der Warteschlange:

| Worker | Aufgabe | Beschreibung |
|--------|---------|--------------|
| `embed-session` | Embeddings | Generiert Vektor-Embeddings für semantische Suche |
| `enrich-session` | KI-Anreicherung | Reichert Beobachtungen mit KI-generierten Zusammenfassungen, Fakten, Konzepten an |
| `compress-session` | Komprimierung | Komprimiert alte Beobachtungen (10:1–25:1) und generiert Session-Digests (20:1–100:1) |

Worker laufen automatisch nach Session-Ende. Jeder Worker:
- Verarbeitet bis zu 200 Elemente pro Durchlauf
- Verwendet Lock-Dateien, um gleichzeitige Ausführung zu verhindern
- Beendet sich nach 5 Minuten automatisch (verhindert Zombies)
- Wiederholt fehlgeschlagene Aufgaben bis zu 3 Mal

---

## KI-Provider-Konfiguration

KI-Anreicherung verwendet austauschbare Provider. Standard ist `claude-cli` (kein API-Key benötigt).

| Provider | Typ | Standard-Modell | Hinweise |
|----------|-----|-----------------|----------|
| **Claude CLI** | `claude-cli` | `haiku` | Verwendet `claude --print`, kein API-Key benötigt |
| **OpenAI** | `openai` | `gpt-4o-mini` | Jedes OpenAI-Modell |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | Google AI Studio Key |
| **OpenRouter** | `openai` | beliebig | `baseUrl` auf `https://openrouter.ai/api/v1` setzen |
| **GLM (Zhipu)** | `openai` | beliebig | `baseUrl` auf `https://open.bigmodel.cn/api/paas/v4` setzen |
| **Ollama** | `openai` | beliebig | `baseUrl` auf `http://localhost:11434/v1` setzen |

### Option 1: Umgebungsvariablen

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (verwendet OpenAI-kompatibles Format)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# Lokales Ollama (kein API-Key benötigt)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# KI-Anreicherung komplett deaktivieren
export AGENTKITS_AI_ENRICHMENT=false
```

### Option 2: Persistente Einstellungen

```bash
# In .claude/memory/settings.json gespeichert — bleibt über Sessions bestehen
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx agentkits-memory-hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx agentkits-memory-hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# Aktuelle Einstellungen anzeigen
npx agentkits-memory-hook settings .

# Auf Standard zurücksetzen
npx agentkits-memory-hook settings . --reset
```

> **Priorität:** Umgebungsvariablen überschreiben settings.json. Settings.json überschreibt Standardwerte.

---

## Lifecycle-Management

Memory-Wachstum im Laufe der Zeit verwalten:

```bash
# Beobachtungen älter als 7 Tage komprimieren, Sessions älter als 30 Tage archivieren
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30

# Zusätzlich archivierte Sessions älter als 90 Tage automatisch löschen
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# Lifecycle-Statistiken anzeigen
npx agentkits-memory-hook lifecycle-stats .
```

| Phase | Was passiert |
|-------|-------------|
| **Komprimierung** | KI-komprimiert Beobachtungen, generiert Session-Digests |
| **Archivierung** | Markiert alte Sessions als archiviert (aus Kontext ausgeschlossen) |
| **Löschung** | Entfernt archivierte Sessions (Opt-in, erfordert `--delete`) |

---

## Export / Import

Backup und Wiederherstellung Ihrer Projekt-Erinnerungen:

```bash
# Alle Sessions für ein Projekt exportieren
npx agentkits-memory-hook export . my-project ./backup.json

# Aus Backup importieren (dedupliziert automatisch)
npx agentkits-memory-hook import . ./backup.json
```

Export-Format enthält Sessions, Beobachtungen, Prompts und Zusammenfassungen.

---

## Memory-Kategorien

| Kategorie | Anwendungsfall |
|-----------|----------------|
| `decision` | Architektur-Entscheidungen, Tech-Stack-Auswahl, Trade-offs |
| `pattern` | Coding-Konventionen, Projekt-Muster, wiederkehrende Ansätze |
| `error` | Bugfixes, Fehlerlösungen, Debugging-Einblicke |
| `context` | Projekt-Hintergrund, Team-Konventionen, Umgebungs-Setup |
| `observation` | Automatisch erfasste Session-Beobachtungen |

---

## Speicherung

Erinnerungen werden in `.claude/memory/` innerhalb Ihres Projektverzeichnisses gespeichert.

```
.claude/memory/
├── memory.db          # SQLite-Datenbank (alle Daten)
├── memory.db-wal      # Write-ahead Log (temp)
├── settings.json      # Persistente Einstellungen (KI-Provider, Kontext-Config)
└── embeddings-cache/  # Gecachte Vektor-Embeddings
```

---

## CJK-Sprachunterstützung

AgentKits Memory hat **automatische CJK-Unterstützung** für chinesische, japanische und koreanische Textsuche.

### Null Konfiguration

Wenn `better-sqlite3` installiert ist (Standard), funktioniert CJK-Suche automatisch:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// CJK-Inhalt speichern
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// Auf Japanisch, Chinesisch oder Koreanisch suchen - es funktioniert einfach!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### So funktioniert es

- **Native SQLite**: Verwendet `better-sqlite3` für maximale Performance
- **Trigram-Tokenizer**: FTS5 mit Trigram erstellt 3-Zeichen-Sequenzen für CJK-Matching
- **Smart Fallback**: Kurze CJK-Abfragen (< 3 Zeichen) verwenden automatisch LIKE-Suche
- **BM25-Ranking**: Relevanz-Scoring für Suchergebnisse

### Erweitert: Japanische Wortsegmentierung

Für erweitertes Japanisch mit ordentlicher Wortsegmentierung optional lindera verwenden:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

Erfordert [lindera-sqlite](https://github.com/lindera/lindera-sqlite) Build.

---

## API-Referenz

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // Standard: '.claude/memory'
  dbFilename: string;           // Standard: 'memory.db'
  enableVectorIndex: boolean;   // Standard: false
  dimensions: number;           // Standard: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // Standard: true
  cacheSize: number;            // Standard: 1000
  cacheTtl: number;             // Standard: 300000 (5 Min.)
}
```

### Methoden

| Methode | Beschreibung |
|---------|--------------|
| `initialize()` | Memory-Service initialisieren |
| `shutdown()` | Herunterfahren und Änderungen speichern |
| `storeEntry(input)` | Memory-Eintrag speichern |
| `get(id)` | Eintrag nach ID abrufen |
| `getByKey(namespace, key)` | Eintrag nach Namespace und Key abrufen |
| `update(id, update)` | Eintrag aktualisieren |
| `delete(id)` | Eintrag löschen |
| `query(query)` | Einträge mit Filtern abfragen |
| `semanticSearch(content, k)` | Semantische Ähnlichkeitssuche |
| `count(namespace?)` | Einträge zählen |
| `listNamespaces()` | Alle Namespaces auflisten |
| `getStats()` | Statistiken abrufen |

---

## Anforderungen

- **Node.js LTS**: 18.x, 20.x oder 22.x (empfohlen)
- MCP-kompatibler KI-Coding-Assistent

### Node.js-Versions-Hinweise

Dieses Paket verwendet `better-sqlite3`, das native Binaries benötigt. **Vorgefertigte Binaries sind nur für LTS-Versionen verfügbar**.

| Node-Version | Status | Hinweise |
|--------------|--------|----------|
| 18.x LTS | ✅ Funktioniert | Vorgefertigte Binaries |
| 20.x LTS | ✅ Funktioniert | Vorgefertigte Binaries |
| 22.x LTS | ✅ Funktioniert | Vorgefertigte Binaries |
| 19.x, 21.x, 23.x | ⚠️ Benötigt Build-Tools | Keine vorgefertigten Binaries |

### Nicht-LTS-Versionen verwenden (Windows)

Wenn Sie eine Nicht-LTS-Version (19, 21, 23) verwenden müssen, installieren Sie zuerst Build-Tools:

**Option 1: Visual Studio Build Tools**
```powershell
# Herunterladen und installieren von:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Wählen Sie "Desktopentwicklung mit C++"-Workload
```

**Option 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**Option 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

Siehe [node-gyp Windows-Leitfaden](https://github.com/nodejs/node-gyp#on-windows) für weitere Details.

---

## AgentKits-Ökosystem

**AgentKits Memory** ist Teil des AgentKits-Ökosystems von AityTech - Tools, die KI-Coding-Assistenten intelligenter machen.

| Produkt | Beschreibung | Link |
|---------|--------------|------|
| **AgentKits Engineer** | 28 spezialisierte Agents, 100+ Skills, Enterprise-Muster | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | KI-gestützte Marketing-Content-Generierung | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | Persistenter Speicher für KI-Assistenten (dieses Paket) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

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

## Lizenz

MIT

---

<p align="center">
  <strong>Geben Sie Ihrem KI-Assistenten Speicher, der bleibt.</strong>
</p>

<p align="center">
  <em>AgentKits Memory von AityTech</em>
</p>

<p align="center">
  Sternchen Sie dieses Repo, wenn es Ihrer KI hilft, sich zu erinnern.
</p>