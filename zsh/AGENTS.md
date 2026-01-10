# Zsh Configuration - Agent Guidelines

Minimal, fast zsh setup without Oh-My-Zsh. Startup time: ~70ms.

## Why No Oh-My-Zsh?

OMZ added ~1.5s to shell startup due to:
- Loading 350+ files on every shell start
- Running `compinit` multiple times
- Plugin system overhead
- Auto-update checks

The current setup sources only what's needed, achieving 25x faster startup.

## File Structure

| File | Purpose |
|------|---------|
| `zsh.rc` | Main config (linked to `~/.zshrc`) |
| `.zshenv` | Environment variables for ALL shells (linked to `~/.zshenv`) |
| `.p10k.zsh` | Powerlevel10k prompt config (linked to `~/.p10k.zsh`) |
| `aliases.zsh` | Shell aliases |
| `fzf-integration.zsh` | Cached fzf shell integration (for speed) |
| `links.prop` | Symlink definitions for install script |
| `custom/plugins/zsh-autosuggestions/` | Autosuggestions plugin |
| `custom/themes/powerlevel10k/` | p10k prompt theme |

## Maintenance

### Automatic (no action needed)
- **compinit cache**: Regenerates once per day
- **p10k instant prompt**: Regenerates when p10k config changes

### Manual (rare)
- **fzf cache**: Regenerate after major fzf upgrades
  ```bash
  fzf --zsh > $DOTFILES/zsh/fzf-integration.zsh
  ```
- **zsh-autosuggestions**: Update by pulling latest in `custom/plugins/zsh-autosuggestions/`
- **powerlevel10k**: Update by pulling latest in `custom/themes/powerlevel10k/`

## Adding Features

### Aliases
Add to `aliases.zsh` - sourced once at startup.

### Environment Variables
Add to `.zshenv` for availability in all shells (including non-interactive).
Add to `zsh.rc` if only needed in interactive shells.

### New Plugins
Source directly in `zsh.rc` under the Plugins section:
```zsh
if [[ -f $DOTFILES/zsh/custom/plugins/plugin-name/plugin.zsh ]]; then
  source $DOTFILES/zsh/custom/plugins/plugin-name/plugin.zsh
fi
```

### Shell Functions
Add to `zsh.rc` under the Tools section, or create a new section if needed.

## Troubleshooting

### Check startup time
```bash
time zsh -i -c exit
```
Target: <100ms. If >200ms, investigate with profiling.

### Profile slow startup
```bash
zsh -c 'zmodload zsh/zprof; source ~/.zshrc; zprof' 2>&1 | head -20
```

### Features not working
Verify plugins are loaded:
```bash
zsh -i -c 'type z'              # Directory jumping
zsh -i -c 'bindkey -l | grep vi' # Vi mode
```

## Code Style

- Use `[[ ]]` for conditionals (faster than `[ ]`)
- Quote variables: `"$VAR"` not `$VAR`
- Use conditional sourcing pattern for optional files:
  ```zsh
  [[ -f $FILE ]] && source $FILE
  ```
