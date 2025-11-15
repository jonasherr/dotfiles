# Agent Guidelines for Neovim Configuration

## Build/Lint/Test Commands
- **Format Lua**: `stylua .` (configured in .stylua.toml)
- **Format JS/TS**: Uses biome via conform.nvim (auto-format on save)
- **No test suite**: This is a personal Neovim configuration
- **Validate config**: Start nvim and check for errors with `:checkhealth`

## Code Style Guidelines
- **Language**: Lua for configuration, JSON for snippets
- **Indentation**: 2 spaces (configured in .stylua.toml)
- **Line width**: 160 characters max
- **Quotes**: Auto-prefer single quotes in Lua
- **Function calls**: No parentheses when possible (`call_parentheses = "None"`)

## File Organization
- **Plugin configs**: `lua/plugins/` organized by category (lsp/, git/, styling/, etc.)
- **Main config**: `lua/settings.lua` for vim options, `lua/keymap.lua` for keymaps
- **Imports**: Use `{ import = 'plugins.category' }` pattern in `lua/plugins/init.lua`
- **Plugin structure**: Return table with plugin spec, use `opts` for simple configs

## Naming Conventions
- **Files**: kebab-case (e.g., `mason-lsp.lua`, `which-keys.lua`)
- **Variables**: snake_case following Lua conventions
- **Keymaps**: Use descriptive descriptions in `desc` field

## Error Handling
- Use `vim.notify()` for user messages with appropriate log levels
- Prefer `opts` over manual `config` functions when possible
- Check plugin documentation for proper configuration patterns