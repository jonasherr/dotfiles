# Kanata Configuration

Kanata keyboard remapper for macOS. Designed around a **40-key mindset** — only the 3×10 letter grid + 3 thumb keys are used for layers and home row mods. The full MacBook keyboard is intercepted so number row / outer keys still work as fallback.

## Layout

### 40-Key Zone

```
   q  w  e  r  t    y  u  i  o  p
   a  s  d  f  g    h  j  k  l  ;
   z  x  c  v  b    n  m  ,  .  /
         Cmd  Spc  Cmd
```

Plus: Caps Lock (Hyper), Shift (both), Backspace, Enter, Tab.

### Home Row Mods

```
Left:   a=Ctrl  s=Alt  d=Cmd  f=Shift  g=System
Right:  j=Shift k=Cmd     l=Alt  ;=Ctrl
```

### Special Keys

- **Caps Lock**: Tap → Escape, Hold → Hyper (⌃⌥⇧⌘)
- **Space**: Tap → Space, Hold → Meh (⌃⌥⇧)
- **Left Command**: Tap → Cmd, Hold → Symbol layer
- **Right Command**: Tap → Cmd, Hold → Numbers layer
- **e**: Tap → e, Hold → Navigation layer

### Special Layer (hold left Cmd)

Symbol mappings (original Karabiner layout):

```
 top:  q    @    #    `    "    &    <    >    _    -
home:  ^    %    *    $    '    \    {    }    |    ~
 bot:  _    =    ~    ^    !    [    (    )    ]    +
```

### Numbers Layer (hold right Cmd)

Digits across the home row:

```
home:  a=1  s=2  d=3  f=4  g=5    h=6  j=7  k=8  l=9  ;=0
```

### System Layer (hold g)

Media, volume, brightness, tab switching:

```
 top:                      prev brdn brup next
home:                      ⌘⇧[  vol- vol+ ⌘⇧]
 bot:                      play
 spc: live reload
```

### Navigation Layer (hold e)

Arrows on HJKL/Vim-style keys, plus paging and delete shortcuts:

```
 top:                 Home PgDn PgUp End  PgUp
home:            ⌘↑   ←    ↓    ↑    →
 bot:            ⌘↓   PgDn ⌥Bspc Bspc Del ⌘Bspc
```

Combine with base layer home row mods (hold simultaneously):
- `f` (Shift) + nav arrows = **select text**
- `s` (Alt) + nav arrows = **word jump**
- `d` (Cmd) + nav arrows = **line start/end**
- `f`+`s` (Shift+Alt) + nav arrows = **select by word**

### Settings

- Tap timeout: 200ms
- Hold timeout: 200ms
- `concurrent-tap-hold` enabled (parallel tap-hold decisions for reliable home row mods)

### Device Filtering

Kanata only affects the MacBook internal keyboard:

```lisp
macos-dev-names-include (
  "Apple Internal Keyboard / Trackpad"
)
```

External keyboards are not remapped.

## Prerequisites (macOS)

Kanata requires the Karabiner driver. Install [Karabiner-Elements](https://karabiner-elements.pqrs.org/), then quit the app — the driver stays installed.

```bash
ls -la /Library/Extensions/ | grep Karabiner
```

## Installation

```bash
brew install kanata
cd ~/Projects/dotfiles && ./install/bootstrap.sh
```

Grant Input Monitoring: **System Settings** → **Privacy & Security** → **Input Monitoring** → add your terminal app.

## Running

For a one-off foreground session:

```bash
sudo kanata --cfg ~/.config/kanata/kanata.kbd
```

`Ctrl+C` stops the foreground session.

For normal use, install Kanata as a macOS LaunchDaemon so it starts at boot and keeps running in the background:

```bash
./kanata/install-launchd.sh
```

This writes a rendered plist to `/Library/LaunchDaemons/com.local.kanata.plist`, owned by `root:wheel`. The checked-in plist is only a template, so the repo does not symlink user-writable files into LaunchDaemons.

Check status and logs:

```bash
./kanata/status-kanata.sh
tail -f /var/log/kanata.log /var/log/kanata.err.log
```

Uninstall the daemon:

```bash
./kanata/uninstall-launchd.sh
```

## Live Reload

Hold `g` + press Space to reload the config from within Kanata. No process restart needed.

## Testing

1. Quit Karabiner-Elements to avoid conflicts.
2. Start Kanata through the LaunchDaemon or foreground command.
3. Test the basics:
   - Hold `f` + press `a` → should type `A`.
   - Hold `a` + press `c` → should send `Ctrl+C`.
   - Tap Caps Lock → should send Escape.
   - Hold Caps Lock + press a key → should send Hyper + key.
   - Hold `g` + press Space → should live reload the config.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Kanata won't start | Check Karabiner driver installation and Input Monitoring permissions. |
| Keys not working | Quit Karabiner-Elements to avoid remapping conflicts. |
| Config errors | Run the foreground command to see errors directly. |
| Config changed but behavior did not | Hold `g` + press Space to live reload. |
| External keyboard affected | Check `macos-dev-names-include` in `kanata.kbd`. |

## Resources

- [Kanata GitHub](https://github.com/jtroo/kanata)
- [Kanata Configuration Guide](https://github.com/jtroo/kanata/blob/main/docs/config.adoc)
- [Linkarzu's Kanata Config](https://github.com/linkarzu/dotfiles-latest/blob/main/kanata/configs/macos.kbd) — inspiration for symbol/system layers
