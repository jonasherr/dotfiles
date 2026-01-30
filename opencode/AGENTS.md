# Development Guidelines

## Philosophy

### Core Beliefs

- **Incremental progress over big bangs** - Small changes that compile and pass tests
- **Learning from existing code** - Study and plan before implementing
- **Pragmatic over dogmatic** - Adapt to project reality
- **Clear intent over clever code** - Be boring and obvious

### Simplicity Means

- Single responsibility per function/class
- Avoid premature abstractions
- No clever tricks - choose the boring solution
- If you need to explain it, it's too complex

## Process

### 1. Planning & Staging

Break complex work into 3-5 stages. Document in `IMPLEMENTATION_PLAN.md`:

```markdown
## Stage N: [Name]
**Goal**: [Specific deliverable]
**Success Criteria**: [Testable outcomes]
**Tests**: [Specific test cases]
**Status**: [Not Started|In Progress|Complete]
```
- Update status as you progress
- Remove file when all stages are done

### 2. Implementation Flow

1. **Understand** - Study existing patterns in codebase
2. **Test** - Write test first (red)
3. **Implement** - Minimal code to pass (green)
4. **Refactor** - Clean up with tests passing
5. **Commit** - With clear message linking to plan

### 3. When Stuck (After 3 Attempts)

**CRITICAL**: Maximum 3 attempts per issue, then STOP.

1. **Document what failed**:
   - What you tried
   - Specific error messages
   - Why you think it failed

2. **Research alternatives**:
   - Find 2-3 similar implementations
   - Note different approaches used

3. **Question fundamentals**:
   - Is this the right abstraction level?
   - Can this be split into smaller problems?
   - Is there a simpler approach entirely?

4. **Try different angle**:
   - Different library/framework feature?
   - Different architectural pattern?
   - Remove abstraction instead of adding?

## Technical Standards

### Architecture Principles

- **Explicit over implicit** - Clear data flow and dependencies
- **Functional over object oriented**
- **Test-driven when possible** - Never disable tests, fix them

### Code Quality

- **Every commit must**:
  - Compile successfully
  - Pass all existing tests
  - Include tests for new functionality
  - Follow project formatting/linting

- **Before committing**:
  - Run formatters/linters
  - Self-review changes
  - Ensure commit message explains "why"

### Error Handling

- Fail fast with descriptive messages
- Include context for debugging
- Handle errors at appropriate level
- Never silently swallow exceptions

## Decision Framework

When multiple valid approaches exist, choose based on:

1. **Testability** - Can I easily test this?
2. **Readability** - Will someone understand this in 6 months?
3. **Consistency** - Does this match project patterns?
4. **Simplicity** - Is this the simplest solution that works?
5. **Reversibility** - How hard to change later?

## Project Integration

### Learning the Codebase

- Find 3 similar features/components
- Identify common patterns and conventions
- Use same libraries/utilities when possible
- Follow existing test patterns

### Next.js Projects

When working in a Next.js project, **always run this command first** to generate local documentation:

```bash
npx @next/codemod agents-md --output AGENTS.md
```

This creates a `.next-docs/` directory containing Next.js documentation tailored to the project's version. The generated `AGENTS.md` will reference these docs, giving you access to:
- API references for App Router, Pages Router, and configuration
- Migration guides and best practices
- Version-specific features and deprecations

**Run this command**:
- On first interaction with any Next.js project
- After upgrading Next.js version
- If `.next-docs/` directory is missing

### Tooling

- Use project's existing build system
- Use project's test framework
- Use project's formatter/linter settings
- Don't introduce new tools without strong justification

## Quality Gates

### Definition of Done

- [ ] Tests written and passing
- [ ] Code follows project conventions
- [ ] No linter/formatter warnings
- [ ] Commit messages are clear
- [ ] Implementation matches plan
- [ ] No TODOs without issue numbers

### Test Guidelines

- Test behavior, not implementation
- One assertion per test when possible
- Clear test names describing scenario
- Use existing test utilities/helpers
- Tests should be deterministic

## Important Reminders

**NEVER**:
- Use `--no-verify` to bypass commit hooks
- Disable tests instead of fixing them
- Commit code that doesn't compile
- Make assumptions - verify with existing code

**ALWAYS**:
- Commit working code incrementally
- Update plan documentation as you go
- Learn from existing implementations
- Stop after 3 failed attempts and reassess

## Skills Management

Skills extend agent capabilities with reusable instruction sets. This dotfiles repo tracks skills in `opencode/skills/`.

### Installing New Skills

Use **copy mode** to install skills directly into the dotfiles-tracked directory:

```bash
# Install a skill with copy mode (recommended for this setup)
npx skills add <source> --skill <skill-name> -a opencode

# When prompted for installation method, select "Copy"
# This writes directly to ~/.config/opencode/skills/ (symlinked to dotfiles)

# Examples:
npx skills add vercel-labs/agent-skills --skill frontend-design -a opencode
npx skills add anthropics/skills --skill pdf -a opencode
```

### Why Copy Mode?

This dotfiles setup symlinks `~/.config/opencode/skills/` → `$DOTFILES/opencode/skills/`.

The default "symlink" installation method creates relative symlinks to `~/.agents/skills/` which break with this setup. Copy mode writes files directly, which works correctly.

### Updating Skills

```bash
# Check for available updates
npx skills check

# Update all installed skills
npx skills update
```

Updates work because the lock file (`~/.agents/.skill-lock.json`) tracks skill sources independently of installation method.

### Finding Skills

```bash
# Interactive skill search
npx skills find

# Search by keyword
npx skills find typescript
```

### Creating Custom Skills

```bash
# Initialize a new skill in skills/ directory
npx skills init my-skill
```

Skills are directories containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does and when to use it
---

# My Skill

Instructions for the agent...
```
