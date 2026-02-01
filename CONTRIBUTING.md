# Contributing to AgentKits Memory

Thanks for your interest in contributing! This document provides guidelines for contributions.

## Ways to Contribute

### 1. Improve Existing Features

- **MCP Tools**: Enhance memory tools (`memory_save`, `memory_search`, etc.)
- **Web Viewer**: Improve UI/UX, add features, fix bugs
- **Hooks**: Improve auto-capture hooks for better session tracking
- **Performance**: Optimize SQLite queries, caching, vector search

### 2. Add New Features

- **New MCP Tools**: Additional memory operations
- **Export Formats**: New export options (JSON, CSV, etc.)
- **Search Improvements**: Better semantic search, filtering
- **Integrations**: Support for more AI coding assistants

### 3. Bug Fixes & Documentation

- Fix typos, broken links, or formatting issues
- Improve documentation clarity
- Add examples or use cases

---

## Development Setup

```bash
# Clone the repository
git clone https://github.com/aitytech/agentkits-memory.git
cd agentkits-memory

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start web viewer for testing
node dist/cli/web-viewer.js
```

---

## Project Structure

```
agentkits-memory/
├── src/
│   ├── index.ts              # Main exports
│   ├── service.ts            # ProjectMemoryService
│   ├── types.ts              # TypeScript types
│   ├── sqljs-backend.ts      # SQLite + WASM backend
│   ├── mcp/
│   │   ├── server.ts         # MCP server
│   │   └── tools.ts          # MCP tool definitions
│   ├── hooks/
│   │   ├── context.ts        # Context hook
│   │   ├── session-init.ts   # Session init hook
│   │   ├── observation.ts    # Observation hook
│   │   └── summarize.ts      # Summarize hook
│   └── cli/
│       ├── viewer.ts         # Terminal viewer
│       ├── web-viewer.ts     # Web viewer
│       ├── save.ts           # CLI save command
│       └── setup.ts          # Setup command
├── dist/                     # Compiled output
├── assets/                   # Images for README
└── hooks.json                # Hook configuration
```

---

## Code Guidelines

### TypeScript

- Use strict TypeScript
- Export types from `types.ts`
- Use async/await for all database operations
- Handle errors gracefully

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx vitest run src/__tests__/index.test.ts
```

### Code Style

- Use 2-space indentation
- Single quotes for strings
- Semicolons required
- Clear function and variable names

---

## Pull Request Process

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature`
3. **Make changes** following the guidelines above
4. **Test** your changes: `npm test`
5. **Build**: `npm run build`
6. **Commit** with clear messages
7. **Push** and create a Pull Request

### PR Checklist

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No breaking changes to existing API
- [ ] Updated relevant documentation
- [ ] Added tests for new features

---

## Ideas for Contributions

### Features
- Memory compression for large entries
- Memory expiration/TTL
- Memory importance scoring
- Batch import/export
- Memory statistics dashboard

### Integrations
- Better vector search with embeddings
- Sync across projects
- Cloud backup (optional)

### Web Viewer
- Dark/light mode toggle
- Memory graph visualization
- Bulk operations
- Advanced search filters

---

## Code of Conduct

- Be respectful and constructive
- Focus on improving the project
- Credit original sources and inspirations

---

## Questions?

- Open an [Issue](https://github.com/aitytech/agentkits-memory/issues)
- Start a [Discussion](https://github.com/aitytech/agentkits-memory/discussions)

Thank you for contributing!
