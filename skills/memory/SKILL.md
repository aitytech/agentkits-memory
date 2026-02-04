---
name: memory
description: Use when you need to recall past work, previous decisions, error solutions, or project history. Activates the 3-layer memory search workflow for token-efficient retrieval.
---

# AgentKits Memory Skill

## When to Activate

Use this skill when:
- User asks about past work, previous sessions, or what was done before
- User references a decision, pattern, or error you don't have context for
- You need project history, conventions, or architectural decisions
- User asks "what did we do about X?" or "how did we handle Y?"
- You're missing context that should exist from earlier sessions
- Starting work on a feature that may have prior decisions recorded

## Prerequisites

Before searching, check if memories exist:
```
memory_status()
```
If the database is empty, skip recall and inform the user.

## 3-Layer Search Workflow

### Layer 1: Search Index (lightweight, ~50 tokens/result)
```
memory_search(query="your search term")
```
- Returns IDs, titles, categories, dates, and relevance scores
- Filter by category: `decision`, `pattern`, `error`, `context`, `observation`
- Filter by date: `dateStart="2025-01-01"`, `dateEnd="2025-12-31"`
- Sort: `orderBy="relevance"` (default), `"date_asc"`, `"date_desc"`

### Layer 2: Timeline Context (understand what happened around a result)
```
memory_timeline(anchor="MEMORY_ID")
```
- Shows what happened before/after a specific memory
- Helps understand the sequence of events
- Use when you need temporal context

### Layer 3: Full Details (only for filtered IDs)
```
memory_details(ids=["ID1", "ID2"])
```
- Returns complete content for selected memories
- Limit to 3-5 IDs at a time to conserve tokens
- NEVER fetch details without filtering through Layer 1 first

## Quick Topic Recall

For a fast overview of everything known about a topic:
```
memory_recall(topic="authentication")
```
This returns a grouped summary. Follow up with `memory_details` for specifics.

## Token Efficiency Rules

1. ALWAYS start with `memory_search` (Layer 1), never jump to `memory_details`
2. Review search results and select only relevant IDs before fetching details
3. Use filters (category, date range) to narrow results
4. Limit `memory_details` to 3-5 IDs per call
5. This workflow saves ~87% tokens vs fetching everything at once
