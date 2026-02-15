# Kanata Setup Summary

## ✅ Complete and Working!

Your Kanata configuration has been successfully migrated from Karabiner-Elements and is fully functional.

## Quick Reference

### Starting Kanata

```bash
kanata
```

This is an alias that runs: `sudo kanata --cfg ~/.config/kanata/kanata.kbd`

The terminal must stay open while Kanata is running. Press `Ctrl+C` to stop.

### Your Keyboard Layout

#### Home Row Mods (Tap to type, hold for modifier)
```
Left hand:  a → Ctrl    s → Option   d → Command   f → Shift
Right hand: j → Shift   k → Command  l → Option    ; → Ctrl
```

#### Special Keys
```
Caps Lock:  Tap → Escape       Hold → Hyper (⌃⌥⇧⌘)
Space:      Tap → Space        Hold → Meh (⌃⌥⇧)
```

#### Layer Switching (Tap to switch, sticky until you switch again)
```
Base Layer:
  Left Cmd:  Tap → Enter special layer (symbols)
  Right Cmd: Tap → Enter numbers layer

Special Layer:
  Left Cmd:  Tap → Return to base layer
  Right Cmd: Tap → Switch to numbers layer
  (Symbol keys active: w=@, e=#, etc.)

Numbers Layer:
  Left Cmd:  Tap → Switch to special layer
  Right Cmd: Tap → Return to base layer
  (Number keys active: u=7, i=8, o=9, etc.)
```

## Configuration Files

```
~/Projects/dotfiles/kanata/
├── kanata.kbd              # Main configuration (155 lines)
├── links.prop              # Symlink setup
├── README.md               # Full documentation
├── QUICKSTART.md           # Quick reference
├── MIGRATION_NOTES.md      # Karabiner comparison
├── stop-karabiner.sh       # Helper to stop Karabiner
└── SUMMARY.md              # This file
```

## Device Filtering

Kanata **only** affects your **MacBook's internal keyboard**.

External keyboards work normally without any remapping.

This is configured via:
```lisp
macos-dev-names-include (
  "Apple Internal Keyboard / Trackpad"
)
```

## Timeout Values

All timeouts are set to **200ms** for responsive feel:
- Tap-hold timeout: 200ms (time to decide if tap or hold)
- Hold timeout: 200ms (minimum hold time before activating hold action)

You can adjust these in the `defvar` section if needed.

## What's Different from Karabiner

1. **Configuration format**: S-expressions instead of TypeScript/JSON
2. **No build step**: Just edit `kanata.kbd` and restart
3. **Layer behavior**: Sticky layers (tap to switch) vs. temporary (hold)
4. **Simpler**: Single config file vs. multiple TypeScript files
5. **Requires sudo**: Must run with sudo on macOS

## Switching Between Karabiner and Kanata

### To use Kanata:
1. Quit Karabiner-Elements app (Menu bar icon → Quit)
2. Run `kanata` in terminal

### To use Karabiner:
1. Stop Kanata (`Ctrl+C` in terminal)
2. Start Karabiner-Elements app

## Next Steps

- **Use it daily**: Test in all your common applications
- **Adjust timeouts**: If 200ms feels too fast/slow, edit `kanata.kbd`
- **Add more features**: See Kanata docs for advanced features
- **Set up auto-start**: Use LaunchDaemon if you want Kanata to start on boot

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Kanata won't start | Make sure Karabiner driver installed & Terminal has Input Monitoring permission |
| Keys not responding | Check timeout values, may need to hold longer |
| Layers not switching | Make sure you're **tapping** Command keys, not holding |
| External keyboard affected | Check device filtering in config |

## Resources

- [Kanata GitHub](https://github.com/jtroo/kanata)
- [Kanata Config Guide](https://github.com/jtroo/kanata/blob/main/docs/config.adoc)
- Your Karabiner backup: `~/Projects/dotfiles/karabiner/`

---

**Status**: ✅ Fully working and documented
**Date**: January 25, 2026
