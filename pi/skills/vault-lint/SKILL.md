---
name: vault-lint
description: Run health checks on the Obsidian vault knowledge base. Find broken wikilinks, orphan notes, stale content, missing frontmatter, duplicate concepts, and suggest new connections. Use when asked to "lint vault", "vault health", "check vault", "find broken links", "find orphans", "vault health check", or "check knowledge base integrity".
---

# Vault Lint

Run health checks on the Obsidian vault and its knowledge base. Report issues and suggest improvements.

## Vault Location

`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/`

## Scope

Run all checks on the full vault by default. The user can narrow scope:

- "lint knowledge" or "check knowledge base": only check files in `knowledge/`
- "check broken links": run only the Broken Wikilinks check
- "check frontmatter": run only the Missing Frontmatter check
- Any check name from the list below can be requested individually

## Health Checks

### 1. Broken Wikilinks

Scan `.md` files for `[[wikilinks]]`. For each link, check if the target note exists (match by filename without extension, or by `id`/`aliases` in frontmatter).

**Efficiency**: Start with `knowledge/` (most likely to have broken cross-references). Only expand to the full vault if the user requests it or if the knowledge/ scan is clean.

Report:
- Source file path
- Line number
- Broken link target
- Suggested fix (closest matching filename, if any)

### 2. Orphan Notes

Find notes with zero inbound wikilinks (nothing links to them).

**Exclude from orphan detection:**
- `_index.md` files
- Files in `areas/templates/`
- Daily notes in `projects/planning/daily/`
- Files in `areas/archive/`
- `AGENTS.md`

Report: file path, last modified date, suggested action (link it from somewhere, or archive it).

### 3. Stale Content

Find notes in active directories not modified in >90 days.

**Active directories to check:**
- `knowledge/`
- `areas/work/` (excluding `daily-reports/` and `freelancing/`)
- `projects/`

**Exclude:**
- `areas/archive/`
- `content/books/`
- `areas/templates/`

Report: file path, last modified date, days since update.

### 4. Missing Frontmatter

Check that notes have required frontmatter fields.

**All notes**: must have `id` and `tags`

**knowledge/ notes**: must also have `type`, `created`

**content/clippings/**: must have `source`, `created`, `tags` containing `clippings`

**knowledge/references/**: must have `source`, `concepts`, `type: reference`

**knowledge/topics/**: must have `sources`, `concepts`, `type: topic`

Report: file path, missing fields.

### 5. Duplicate Concepts

Compare topic articles in `knowledge/topics/`. Flag pairs with significant concept overlap (>50% shared `concepts` tags). Report: both file paths, overlapping concepts, suggest merging or restructuring.

### 6. Uncompiled Inputs

Check for items that should be compiled but haven't been:
- Files in `inbox/` (any file here is unprocessed)
- Files in `content/clippings/` (not in `read/`) without `compiled: true`

Report count and list them. Suggest running `compile vault`.

### 7. Connection Suggestions

After other checks, look for potential connections:
- Topics sharing concepts but not linked to each other
- References that could be linked to existing topics but aren't in their `sources:` list
- Clusters of related content across different vault sections

Report: suggested topic pairs, shared concepts, what the connection article could cover.

### 8. Index Freshness

Check that all `_index.md` files are up to date:
- Does `knowledge/_index.md` stats match actual file counts?
- Are all articles listed in their respective `_index.md`?
- Is the `updated` date in index frontmatter recent?

Report any discrepancies.

## Output

Write results to `knowledge/_health-check.md` (overwrite on each run):

```yaml
---
id: vault-health-check
tags:
  - knowledge
  - meta
type: meta
generated: YYYY-MM-DD
---
```

Body format:

```markdown
# Vault Health Check: YYYY-MM-DD

## Summary

| Check | Issues |
|-------|--------|
| Broken wikilinks | N |
| Orphan notes | N |
| Stale content | N |
| Missing frontmatter | N |
| Duplicate concepts | N |
| Uncompiled inputs | N |
| Connection suggestions | N |
| Index freshness | N |

## Critical (fix now)
...

## Warnings (fix soon)
...

## Suggestions (nice to have)
...
```

Also print a summary to the conversation with counts per check.

## Categorization

Prioritize findings:
- **Critical**: broken wikilinks, missing required frontmatter, stale indexes
- **Warning**: orphan notes, uncompiled inputs, stale content
- **Suggestion**: connection suggestions, duplicate concepts

## Actionability

After reporting, offer to fix automatable issues:

- **Broken wikilinks**: if a close match exists, offer to replace
- **Missing frontmatter**: offer to add missing fields with sensible defaults
- **Stale indexes**: offer to regenerate (equivalent to running Phase 5 of vault-compile)
- **Uncompiled inputs**: offer to run `compile vault`

Ask before making changes: "Found N fixable issues. Fix them now?"

Do not auto-fix: orphan notes, duplicate concepts, stale content (these require human judgment).

## Git

After fixing any issues, stage and commit with message format: `vault: lint fixes (N broken links, M frontmatter updates)`.

## Writing Guidelines

- No emojis
- No em dashes
- Include file paths (relative to vault root) in all findings
- Include line numbers for broken wikilinks
- Be specific about what's wrong and how to fix it
