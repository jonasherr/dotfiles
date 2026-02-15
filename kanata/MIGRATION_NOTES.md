# Migration Notes: Karabiner → Kanata

This document explains how your Karabiner TypeScript configuration was translated to Kanata.

## Configuration Structure Comparison

### Karabiner (TypeScript)
```
karabiner/
├── rules.ts              # Main entry point, builds karabiner.json
├── types.ts              # TypeScript type definitions
├── utils.ts              # Helper functions
├── rules/
│   ├── homerow.ts        # Home row mods
│   ├── hyperKey.ts       # Caps Lock → Hyper
│   ├── meh.ts            # Space → Meh
│   └── layers/
│       ├── arrows.ts     # (Not migrated)
│       ├── layerSwitcher.ts
│       ├── numbers.ts
│       └── special.ts
├── package.json
└── karabiner.json        # Generated output
```

### Kanata (S-expressions)
```
kanata/
├── kanata.kbd            # Single config file (no build needed!)
├── links.prop            # Symlink configuration
├── README.md             # Full documentation
├── QUICKSTART.md         # Quick reference
└── MIGRATION_NOTES.md    # This file
```

## Key Translations

### Home Row Mods

**Karabiner (TypeScript):**
```typescript
homeRowKey([{ key: "f" }], "left_shift")
```

**Kanata (S-expression):**
```lisp
(defalias
  f (tap-hold $tap-timeout $hold-timeout f lsft)
)
```

### Hyper Key

**Karabiner:**
```typescript
{
  from: { key_code: "caps_lock" },
  to: [{ key_code: "left_shift", modifiers: ["left_control", "left_option", "left_command"] }],
  to_if_alone: [{ key_code: "escape" }]
}
```

**Kanata:**
```lisp
(defalias
  cap (tap-hold $tap-timeout $hold-timeout esc (multi lctl lalt lsft lmet))
)
```

### Layer Switching

**Karabiner:**
```typescript
layer("left_command", Layers.special)
```

**Kanata:**
```lisp
(defalias
  lmc (tap-hold $tap-timeout $hold-timeout lmet (layer-while-held special))
)
```

### Symbol Mapping in Layers

**Karabiner:**
```typescript
convertToSpecialLayer("w", "2", ["left_shift"])  // S-2 = @
```

**Kanata:**
```lisp
;; In special layer deflayer
w S-2
```

## Timeout Values Mapping

| Karabiner Parameter | Value | Kanata Variable |
|---------------------|-------|-----------------|
| `simultaneous_threshold_milliseconds` | 50ms | `$simultaneous-threshold` |
| `to_if_alone_timeout_milliseconds` | 1000ms | `$tap-timeout` |
| `to_if_held_down_threshold_milliseconds` | 500ms | `$hold-timeout` |
| `to_delayed_action_delay_milliseconds` | 1000ms | `$delayed-action-timeout` |

## Features Migrated

✅ **Fully Migrated:**
- Home row mods (all 8 keys)
- Hyper key (Caps Lock)
- MEH key (Space)
- Special layer (symbols)
- Numbers layer (numpad)
- Layer switching via Command keys
- All timeout values

⚠️ **Changed:**
- Escape key: No explicit layer reset needed (automatic in Kanata)
- Quote key: Now just types quote (arrows layer removed per request)
- Layer switching: Command keys now use tap to switch layers (sticky) instead of hold
  - In Karabiner: Hold Command to temporarily activate layer
  - In Kanata: Tap Command to switch to layer (stays until you switch back)

❌ **Not Migrated:**
- Arrows layer (removed per request)
- Layer switcher layer (simplified into direct Command key hold)

## Behavior Differences

### Layer Reset
**Karabiner:** Explicit reset with escape key and variable clearing
```typescript
{
  set_variable: { name: "sublayer", value: "" }
}
```

**Kanata:** Automatic when releasing `layer-while-held` keys. Escape just outputs escape.

### Variable System
**Karabiner:** Uses `variables` array in JSON config
```json
{
  "layer": "text",
  "sublayer": "text"
}
```

**Kanata:** Uses `defvar` for configuration values only. Layer state managed internally.

### Simultaneous Keys
**Karabiner:** `createCombinedKey(["j", "k"], "escape")`

**Kanata:** Not included in current config (you weren't using this feature)

## File Comparison

| Aspect | Karabiner | Kanata |
|--------|-----------|--------|
| Language | TypeScript | Lisp-like S-expressions |
| Files | 9+ files | 1 config file |
| Build step | Required (`yarn build`) | None |
| Total lines | ~350+ lines | ~155 lines |
| Type safety | TypeScript | Runtime validation |
| Live reload | Via file watch | Built-in (`lrld`) |

## Advantages of Kanata

1. **Simpler:** Single config file, no build step
2. **Faster:** More efficient, lower resource usage
3. **Cross-platform:** Works on Linux, Windows, macOS (Karabiner is macOS only)
4. **Live reload:** Built into the tool
5. **Less verbose:** S-expressions are more concise than JSON/TypeScript

## Advantages of Karabiner (TypeScript)

1. **Type safety:** TypeScript catches errors at compile time
2. **IDE support:** Better autocomplete and error checking
3. **Modular:** Easier to organize large configs across multiple files
4. **Familiar:** If you already know TypeScript

## Testing Checklist

Before fully switching, test these scenarios:

- [x] Home row mods work in all applications
- [x] Caps Lock → Escape tap works
- [x] Caps Lock → Hyper hold works
- [x] Space → Space tap works
- [x] Space → Meh hold works
- [x] Left Command tap → Special layer
- [x] Left Command tap again → Back to base layer
- [x] Right Command tap → Numbers layer
- [x] Right Command tap again → Back to base layer
- [x] Layers are sticky (stay until switched)
- [x] Works only on MacBook internal keyboard (external keyboards unaffected)
- [ ] No conflicts with system shortcuts (test as you use)
- [ ] Works in all your commonly-used apps (test as you use)

## Rollback Plan

If you need to go back to Karabiner:

1. Stop Kanata: `pkill kanata`
2. Start Karabiner-Elements app
3. Your old config is still at `~/Projects/dotfiles/karabiner/`

Both can coexist on your system, just not running simultaneously.

## Next Steps

1. **Test thoroughly** with both systems over a few days
2. **Tweak timeouts** if needed (edit `defvar` section)
3. **Add live reload key** if you want to iterate quickly
4. **Set up auto-start** when you're happy (see README)
5. **Consider additional features** Kanata offers (see their docs)

## Questions or Issues?

- Check [Kanata documentation](https://github.com/jtroo/kanata/blob/main/docs/config.adoc)
- Ask in [Kanata discussions](https://github.com/jtroo/kanata/discussions)
- Refer back to your Karabiner config for comparison
