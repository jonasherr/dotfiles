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

### Symbol Layer (hold left Cmd)

All numbers and symbols within the 40-key zone:

```
 top:  !    @    #    $    %    ^    &    *    (    )
home:  1    2    3    4    5    6    7    8    9    0
 bot:  `    =    ~    [    {    }    ]    -    +    \
```

### Numbers Layer (hold right Cmd)

Numpad on right hand:

```
 top:                           -    7    8    9
home:                           =    4    5    6
 bot:                      .    0    1    2    3
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

Arrows on HJKL (vim-style), plus movement and delete shortcuts:

```
 top:                      Home PgDn PgUp End
home:                      ←    ↓    ↑    →
 bot:                      ⌥Bspc Bspc Del  ⌘Bspc
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

```bash
kanata                    # alias for sudo kanata --cfg ~/.config/kanata/kanata.kbd
kanata --debug            # with debug output
```

Requires `sudo`. Terminal must stay open. `Ctrl+C` to stop.

## Live Reload

Hold `g` + press Space to reload the config from within kanata. No restart needed.

## Resources

- [Kanata GitHub](https://github.com/jtroo/kanata)
- [Kanata Configuration Guide](https://github.com/jtroo/kanata/blob/main/docs/config.adoc)
- [Linkarzu's Kanata Config](https://github.com/linkarzu/dotfiles-latest/blob/main/kanata/configs/macos.kbd) — inspiration for symbol/system layers
