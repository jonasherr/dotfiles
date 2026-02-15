# Kanata Configuration

Kanata keyboard remapper configuration, migrated from Karabiner-Elements.

## What is Kanata?

[Kanata](https://github.com/jtroo/kanata) is a cross-platform software keyboard remapper that provides:
- Multiple layers of key functionality
- Advanced key behaviors (tap-hold, macros, etc.)
- Live configuration reloading
- Human-readable configuration files

## Features

This configuration mirrors the previous Karabiner setup:

### Home Row Mods
- **Left hand**: `a/s/d/f` → Control/Option/Command/Shift when held
- **Right hand**: `j/k/l/;` → Shift/Command/Option/Control when held

### Special Keys
- **Caps Lock**: Tap for Escape, hold for Hyper (⌃⌥⇧⌘)
- **Space**: Tap for Space, hold for Meh (⌃⌥⇧)

### Layers
- **Special Layer**: Tap left Command to switch to symbol layer (tap again to return to base)
- **Numbers Layer**: Tap right Command to switch to numpad layer (tap again to return to base)
- Layers are sticky - they stay active until you switch to another layer

### Timeout Values
All timeout values match the original Karabiner configuration:
- Simultaneous threshold: 50ms
- Tap timeout: 1000ms
- Hold timeout: 500ms

## Prerequisites (macOS)

**IMPORTANT**: Kanata on macOS requires the Karabiner driver to be installed!

Even though you're switching from Karabiner-Elements to Kanata, you still need Karabiner's underlying driver for Kanata to work.

### Install Karabiner Driver

1. Download Karabiner-Elements from https://karabiner-elements.pqrs.org/
2. Install it (this installs the driver)
3. You can quit Karabiner-Elements app after installation
4. The driver remains installed and Kanata will use it

To verify the driver is installed:
```bash
ls -la /Library/Extensions/ | grep Karabiner
```

You should see `karabiner_grabber.kext` or similar.

## Installation

### 1. Install Kanata

Using Homebrew:
```bash
brew install kanata
```

Or download the latest release from: https://github.com/jtroo/kanata/releases

### 2. Set Up Symlinks

Run the bootstrap script from your dotfiles directory:
```bash
cd ~/Projects/dotfiles
./install/bootstrap.sh
```

This will create: `~/.config/kanata` → `~/Projects/dotfiles/kanata`

### 3. Grant Permissions

On macOS, you need to add **Terminal.app** (or your terminal app) to Input Monitoring:

1. Open **System Settings** → **Privacy & Security** → **Input Monitoring**
2. Add your terminal app (e.g., `/Applications/Utilities/Terminal.app` or Kitty.app)
3. Enable the toggle

This is needed because Kanata runs with `sudo` from the terminal.

## Running Kanata

### Quick Start

An alias has been added to your zsh configuration:

```bash
# Just type this to start Kanata
kanata

# With debug output
sudo kanata --cfg ~/.config/kanata/kanata.kbd --debug
```

The alias runs: `sudo kanata --cfg ~/.config/kanata/kanata.kbd`

**Important**: 
- On macOS, Kanata requires `sudo` to access the Karabiner driver
- The terminal window must stay open while Kanata is running
- To stop Kanata, press `Ctrl+C` in the terminal

### Run at Login (Optional)

To run Kanata automatically on startup, create a LaunchDaemon.

Create `/Library/LaunchDaemons/com.kanata.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kanata</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/kanata</string>
        <string>--cfg</string>
        <string>/Users/YOUR_USERNAME/.config/kanata/kanata.kbd</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/kanata.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/kanata.out</string>
</dict>
</plist>
```

Replace `YOUR_USERNAME` with your actual username.

Load the launch agent:
```bash
launchctl load ~/Library/LaunchAgents/com.kanata.plist
```

To stop:
```bash
launchctl unload ~/Library/LaunchAgents/com.kanata.plist
```

## Usage

### Testing Your Setup

1. **Stop Karabiner-Elements** if it's running (to avoid conflicts)
2. Start Kanata: `kanata`
3. Test the home row mods:
   - Hold `a` briefly and press `c` → should output `Ctrl+C`
   - Hold `f` briefly and press `a` → should output `A` (shift)
4. Test Hyper key:
   - Tap Caps Lock → Escape
   - Hold Caps Lock + another key → Hyper modifier (⌃⌥⇧⌘)
5. Test MEH key:
   - Tap Space → Space
   - Hold Space + another key → Meh modifier (⌃⌥⇧)
6. Test layers:
   - **Tap** left Command → Enter special layer (symbols)
   - Press `w` → outputs `@` (Shift+2)
   - **Tap** left Command again → Return to base layer
   - **Tap** right Command → Enter numbers layer
   - Press `u` → outputs `7`
   - **Tap** right Command again → Return to base layer

### Live Reload

Kanata supports live reloading! After editing `kanata.kbd`:

```bash
# If running manually, just Ctrl+C and restart
# If using launchctl:
launchctl kickstart -k gui/$(id -u)/com.kanata
```

Or add a live reload key to your config (see Customization section).

## Switching Between Karabiner and Kanata

### To use Kanata:
1. Quit Karabiner-Elements (keep driver installed)
2. Start Kanata

### To use Karabiner-Elements:
1. Stop Kanata
2. Start Karabiner-Elements

Only one can run at a time since they both intercept keyboard events.

## Customization

### Adding a Live Reload Key

Add to your config:

```lisp
(defalias
  reload lrld  ;; Live reload configuration
)

(deflayer base
  ;; ... your other keys ...
  @reload  ;; Put this on a convenient key
)
```

Now pressing that key will reload your config without restarting Kanata.

### Adjusting Timeouts

Modify the variables at the top of `kanata.kbd`:

```lisp
(defvar
  tap-timeout 1000      ;; How long to wait for tap vs hold
  hold-timeout 500      ;; How long to hold before registering as hold
)
```

### Adding New Layers

1. Define a new layer switcher alias:
```lisp
(defalias
  nav (layer-while-held navigation)
)
```

2. Add it to your base layer
3. Create the new layer:
```lisp
(deflayer navigation
  _  _  _  _  ... ;; your mappings
)
```

## Differences from Karabiner

### Simpler Layer Model
Kanata has a cleaner layer stack concept. When you release a layer-while-held key, you automatically return to the base layer. No need for manual layer reset logic.

### No Build Step
Unlike your Karabiner TypeScript setup, Kanata configs are just text files. No compilation needed!

### Configuration Format
- Karabiner: TypeScript/JSON
- Kanata: S-expressions (Lisp-like syntax)

### Performance
Kanata is typically faster and uses less resources than Karabiner-Elements.

## Troubleshooting

### Kanata Won't Start

**Error: "Could not open keyboard device"**
- Make sure Karabiner driver is installed
- Check Input Monitoring permissions

**Error: "Parse error"**
- Check your config syntax
- Run with `--debug` flag for details
- Ensure all parentheses are balanced

### Keys Not Working

1. Check if the key is in `defsrc`
2. Verify `process-unmapped-keys yes` is in `defcfg`
3. Check terminal output for errors
4. Try with `--debug` flag

### Conflicts with Karabiner

Make sure Karabiner-Elements app is fully quit:
```bash
pkill -9 karabiner
ps aux | grep karabiner  # Should show nothing
```

### Layer Not Activating

- Verify the layer name matches in both alias and deflayer
- Check that the key is in defsrc
- Try with `--debug` to see layer state changes

## Resources

- [Kanata GitHub](https://github.com/jtroo/kanata)
- [Kanata Configuration Guide](https://github.com/jtroo/kanata/blob/main/docs/config.adoc)
- [Example Configurations](https://github.com/jtroo/kanata/tree/main/cfg_samples)
- [Kanata Wiki](https://github.com/jtroo/kanata/wiki)

## Migration Notes

This configuration was migrated from a Karabiner-Elements TypeScript setup. Key differences:

1. **Arrows layer removed**: As requested, not included in this config
2. **Quote key**: Now just types quote (no layer switching)
3. **Escape behavior**: Simplified - just outputs escape (layer reset automatic)
4. **Layer switchers**: Now on left/right Command instead of separate layer switcher

If you want to restore any removed functionality, refer to your original Karabiner config at `~/Projects/dotfiles/karabiner/`.
