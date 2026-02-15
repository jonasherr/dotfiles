# Kanata Quick Start

## Installation (One-Time Setup)

```bash
# 1. Install Kanata
brew install kanata

# 2. Install Karabiner driver (required for macOS)
#    Download from: https://karabiner-elements.pqrs.org/
#    Install, then quit the app (driver stays installed)

# 3. Set up symlinks
cd ~/Projects/dotfiles
./install/bootstrap.sh

# 4. Grant Input Monitoring permissions
#    System Settings → Privacy & Security → Input Monitoring
#    Add /opt/homebrew/bin/kanata and enable it
```

## Running Kanata

```bash
# Start Kanata (alias configured in zsh)
kanata

# Stop Kanata
# Press Ctrl+C in the terminal where Kanata is running
```

## Your Keyboard Layout

### Home Row Mods
```
Left hand:  a → Ctrl    s → Option   d → Command   f → Shift
Right hand: j → Shift   k → Command  l → Option    ; → Ctrl
```

### Special Keys
```
Caps Lock:  Tap → Escape       Hold → Hyper (⌃⌥⇧⌘)
Space:      Tap → Space        Hold → Meh (⌃⌥⇧)
```

### Layers (Sticky - stay active until you switch)
```
Left Cmd:   Tap → Special layer (symbols)    Tap again → Base layer
Right Cmd:  Tap → Numbers layer (numpad)     Tap again → Base layer
```

## Testing

1. **Quit Karabiner-Elements** (to avoid conflicts)
2. Start Kanata
3. Test:
   - Hold `f` + press `a` → Should type `A` (shift working)
   - Hold `a` + press `c` → Should send `Ctrl+C`
   - Tap Caps Lock → Should output Escape
   - Hold Caps Lock + press key → Hyper modifier

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Kanata won't start | Check Karabiner driver installed + Input Monitoring permissions |
| Keys not working | Make sure Karabiner-Elements app is quit: `pkill -9 karabiner` |
| Config errors | Run with `--debug` flag to see details |
| Need to edit config | Edit `~/.config/kanata/kanata.kbd` and restart Kanata |

## Next Steps

- Read the full [README.md](README.md) for detailed setup
- Try your setup for a few days alongside Karabiner
- If happy, set up auto-start with launchctl (see README)
- Customize further by editing `kanata.kbd`

## Quick Config Edit

```bash
# Edit config
nvim ~/.config/kanata/kanata.kbd

# Restart Kanata (if running via launchctl)
launchctl kickstart -k gui/$(id -u)/com.kanata

# Or just kill and restart manually
pkill kanata && kanata --cfg ~/.config/kanata/kanata.kbd &
```
