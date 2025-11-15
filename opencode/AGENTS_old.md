# AGENTS.md - OpenCode Configuration Repository

## Project Type
This is an OpenCode configuration repository containing specialized AI agent definitions, configuration files, and plugins for enhanced development workflows.

## Project Structure
```
opencode/
├── agent/                          # AI agent definitions
│   ├── contains-studio-agents/     # Comprehensive studio agent collection
│   │   ├── bonus/                  # Special purpose agents
│   │   ├── design/                 # UI/UX and visual design agents
│   │   ├── engineering/            # Development and technical agents
│   │   ├── marketing/              # Growth and content agents
│   │   ├── product/                # Product management agents
│   │   ├── project-management/     # Project coordination agents
│   │   ├── studio-operations/      # Business operations agents
│   │   └── testing/                # Quality assurance agents
│   ├── text-polisher.md           # Text refinement specialist
│   └── pii-scrubber.md            # Privacy protection specialist
├── plugin/                         # OpenCode plugins
│   └── sound-notification.ts       # Audio notification plugin
├── opencode.json                   # Main configuration file
├── install.sh                     # Installation script
└── links.prop                     # Link properties file
```

## Build/Test Commands
No build commands - this is a configuration repository with markdown files and JSON config.

## Configuration Details

### OpenCode Configuration (opencode.json)
- **Provider Setup**: Ollama local provider with qwen3:8b model
- **Keybinds**: Custom keyboard shortcuts for efficient workflow
- **MCP Integrations**: Playwright for browser automation, Context7 for documentation

### Agent Categories

#### Core Agents (2 agents)
- **text-polisher**: Text refinement and writing enhancement
- **pii-scrubber**: Privacy protection and data anonymization

#### Contains Studio Agents (35+ agents)
Comprehensive collection organized by department:

**Engineering (7 agents)**
- ai-engineer, backend-architect, devops-automator, frontend-developer
- mobile-app-builder, rapid-prototyper, test-writer-fixer

**Design (5 agents)**  
- brand-guardian, ui-designer, ux-researcher, visual-storyteller, whimsy-injector

**Marketing (7 agents)**
- app-store-optimizer, content-creator, growth-hacker, instagram-curator
- reddit-community-builder, tiktok-strategist, twitter-engager

**Product (3 agents)**
- feedback-synthesizer, sprint-prioritizer, trend-researcher

**Project Management (3 agents)**
- experiment-tracker, project-shipper, studio-producer

**Studio Operations (5 agents)**
- analytics-reporter, finance-tracker, infrastructure-maintainer
- legal-compliance-checker, support-responder

**Testing (5 agents)**
- api-tester, performance-benchmarker, test-results-analyzer
- tool-evaluator, workflow-optimizer

**Bonus (1 agent)**
- studio-coach

### Plugin System
- **sound-notification.ts**: Plays system sounds on task completion

## Code Style Guidelines

### File Structure
- Agent definitions in `agent/` directory organized by category
- Configuration files in root (opencode.json)
- Use kebab-case for filenames and directories
- Plugins in `plugin/` directory with TypeScript files

### Agent Definition Format
- YAML frontmatter with name, description, color, tools, and optional model
- Markdown content with detailed system prompts (500+ words)
- Include 3-4 usage examples with context and commentary
- Clear role definition and expertise areas

### Naming Conventions
- Agent names: kebab-case (e.g., `text-polisher`, `pii-scrubber`)
- Directory names: kebab-case
- File extensions: `.md` for agents, `.json` for config, `.ts` for plugins

### Content Guidelines
- Use clear, professional language in agent descriptions
- Include specific examples with user/assistant dialogue
- Maintain consistent formatting across all agent files
- Follow the established template structure from existing agents
- System prompts should define expertise, responsibilities, and success metrics

### Agent Template Structure
```markdown
---
name: agent-name
description: Use this agent when [scenario]. Examples with context/commentary.
color: agent-color
tools: Tool1, Tool2, Tool3
model: optional-model-override
---

You are a [role] who [primary function]. Your expertise spans [domains].

Your primary responsibilities:
1. [Responsibility 1]
2. [Responsibility 2]
...

[Detailed system prompt content...]

Your goal is to [ultimate objective].
```