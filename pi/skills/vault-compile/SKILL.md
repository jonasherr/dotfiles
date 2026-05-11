---
name: vault-compile
description: Compile raw inputs (web clippings, inbox items, agent learnings) into structured knowledge articles in the Obsidian vault's knowledge/ directory. Use when asked to "compile", "compile vault", "compile knowledge", "update wiki", "process inbox", "compile clippings", or when processing new raw inputs into the knowledge base. Also use when filing investigation results, research outputs, or agent work products back into the knowledge base.
---

# Vault Compile

Compile raw inputs from the Obsidian vault into structured, cross-linked knowledge articles.

## Vault Location

`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/`

All paths below are relative to this root.

## Input Sources

Scan these for unprocessed items (in priority order):

1. **`inbox/`** — all files here are unprocessed by definition
2. **`content/clippings/`** — web clippings NOT in the `read/` subfolder. Check frontmatter for `compiled: true`. If absent or false, the clipping is unprocessed.
3. **`areas/agent-learnings/inbox.md`** — structured agent findings. Process entries with `Confidence: high` that don't already have a corresponding reference in `knowledge/references/`.

## Output Directories

```
knowledge/
├── _index.md          # Master index (maintain this)
├── topics/            # Synthesized topic articles
│   └── _index.md
├── references/        # Source summaries (one per input)
│   └── _index.md
└── connections/       # Cross-cutting insights
    └── _index.md
```

## Compilation Workflow

### Phase 1: Discover unprocessed inputs

1. List files in `inbox/`
2. List files in `content/clippings/` (exclude `read/` subfolder), filter to those without `compiled: true` in frontmatter
3. Read `areas/agent-learnings/inbox.md`, identify high-confidence entries not yet referenced in `knowledge/references/`
4. Read `knowledge/references/_index.md` to know what's already been processed
5. Report what was found: "Found N unprocessed items: X clippings, Y inbox notes, Z agent learnings"

If nothing is unprocessed, report that and stop.

### Phase 2: Create reference summaries

First, check for near-duplicates: read `knowledge/references/_index.md` and compare each new input against existing references. If a new input covers substantially the same source or argument as an existing reference, update the existing reference instead of creating a new one. Add any new details and append to its `sources:` if the input is a different document.

For each genuinely new input, create `knowledge/references/<source-slug>.md`:

```yaml
---
id: ref-<source-slug>
aliases:
  - ref-<source-slug>
tags:
  - knowledge
  - reference
type: reference
source: "[[original-note-filename]]"
source_url: "https://..." # if from web clipping
concepts:
  - concept1
  - concept2
created: YYYY-MM-DD
---
```

Body structure:
- **Summary** (2-4 paragraphs, 200-400 words): key arguments, findings, and takeaways
- **Key Concepts**: bullet list of main ideas with brief explanations
- **Relevance**: one sentence on why this matters in the context of the vault's existing knowledge
- **Sources**: link back to `[[original-note]]`

After creating the reference, mark the source as processed:
- Clippings: add `compiled: true` and `compiled_date: YYYY-MM-DD` to frontmatter
- Inbox files: move the file to `content/clippings/read/`
- Agent learnings: no modification needed (the reference file tracks what was processed)

### Phase 3: Update or create topic articles

1. Read `knowledge/topics/_index.md` to see existing topics
2. For each new reference:
   - If it relates to an existing topic: update that topic article with new information, add the reference to its `sources:` list, update `updated:` date
   - If it introduces a concept that appears across 2+ sources (new or existing): create a new topic article
3. Topic articles live at `knowledge/topics/<topic-slug>.md`

**When to create a new topic:** A concept must appear across 2+ sources AND be substantial enough to sustain a 300+ word article. Single tool flags, config options, or narrow API quirks stay as references only. Good topics are broad enough to accumulate future sources (e.g., "Next.js runtime signals for cache diagnosis") not so narrow they'll never grow (e.g., "curl size_download flag behavior").

Topic article structure:

```yaml
---
id: topic-<slug>
aliases:
  - topic-<slug>
tags:
  - knowledge
  - topic
type: topic
sources:
  - "[[ref-source1]]"
  - "[[ref-source2]]"
concepts:
  - concept1
  - concept2
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Body structure:
- **Overview** (1-2 paragraphs): what this topic is about
- **Details** (structured sections): the synthesized knowledge, organized logically
- **Practical Applications** (optional): how this knowledge is used in practice
- **Open Questions** (optional): things worth investigating further
- **Sources**: list of `[[ref-*]]` links

Topic articles should be 300-800 words. Dense, not fluffy.

### Phase 4: Discover connections

After processing all items:

1. Compare concept tags across all topic articles
2. If two topics share concepts but aren't linked, and the relationship is non-obvious: create a connection article
3. Connection articles live at `knowledge/connections/<connection-slug>.md`

Connection article structure:

```yaml
---
id: conn-<slug>
aliases:
  - conn-<slug>
tags:
  - knowledge
  - connection
type: connection
links:
  - "[[topic-1]]"
  - "[[topic-2]]"
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Body: 200-500 words explaining how the linked topics relate, what patterns emerge, and why the connection matters.

Only create connections that are genuinely insightful. Do not create connections for obvious relationships.

### Phase 5: Update all indexes

Update every `_index.md` file to reflect current state:

**`knowledge/_index.md`**: Update stats (topic count, reference count, connection count, last compiled date). List recent updates.

**`knowledge/topics/_index.md`**: List all topic articles with one-line descriptions. Format:

```markdown
## Articles

- [[topic-slug]] — One-line description (N sources, updated YYYY-MM-DD)
```

**`knowledge/references/_index.md`**: List all references. Format:

```markdown
## Sources

- [[ref-slug]] — "Original Title" from source (compiled YYYY-MM-DD)
```

**`knowledge/connections/_index.md`**: List all connections. Format:

```markdown
## Connections

- [[conn-slug]] — Links [[topic-a]] and [[topic-b]]: one-line insight
```

## Writing Guidelines

- English for all knowledge/ content
- No emojis
- No em dashes. Use colons or periods instead.
- Active voice, short sentences, one idea per sentence
- Use `[[wikilinks]]` for all cross-references within the vault
- Use `kebab-case` for all filenames
- Every article must have a `## Sources` section at the bottom
- Prefer concrete examples over abstract descriptions

## Partial Compilation

The user may request specific scopes:

- "compile inbox" — only process `inbox/` items
- "compile clippings" — only process `content/clippings/`
- "compile learnings" — only process agent learnings from `inbox.md`
- "compile [filename]" — process a specific file

Still run Phase 3-5 (topic updates, connections, indexes) after partial compilation.

## Dry Run

If the user asks for "dry run", "preview", or "what would compile do": scan all inputs, report what would be created/updated, but do not write any files.

## Filing Outputs Back

When the user says "file this", "add to knowledge base", or "save this to wiki" during a session:

1. **Identify what to file**: the last substantive output (analysis, investigation, research summary). If ambiguous, ask.
2. **Create a reference** in `knowledge/references/` using the session topic as the slug. Since there's no source file, use this frontmatter pattern:
   ```yaml
   source: "session output"
   source_url: ""
   ```
3. **Run Phase 3-5** as normal: check for topic updates, connections, and update indexes.

This ensures ad-hoc research and investigation results accumulate in the knowledge base rather than being lost after the session ends.

## Git

After completing all writes (compilation or filing), stage and commit changes with message format: `vault: compile knowledge base (N new references, M topic updates)`. This follows the vault's agent commit protocol.
