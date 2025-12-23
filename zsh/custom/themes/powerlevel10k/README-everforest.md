# Everforest Color Scheme for Powerlevel10k

This directory contains Everforest color scheme configurations for Powerlevel10k, based on the beautiful [Everforest color palette](https://github.com/sainnhe/everforest).

## Available Themes

### Dark Theme (`p10k-everforest-dark.zsh`)
- **Background**: `#2D353B` (bg0) - Warm dark background
- **Foreground**: `#D3C6AA` (fg) - Soft cream text
- **Accent Colors**: 
  - Red: `#E67E80` - Errors, alerts
  - Orange: `#E69875` - Warnings
  - Yellow: `#DBBC7F` - Cautions, modified files
  - Green: `#A7C080` - Success, clean git status
  - Aqua: `#83C092` - Info, constants
  - Blue: `#7FBBB3` - Directories, links
  - Purple: `#D699B6` - Special elements

### Light Theme (`p10k-everforest-light.zsh`)
- **Background**: `#FDF6E3` (bg0) - Warm light background
- **Foreground**: `#5C6A72` (fg) - Dark grey text
- **Accent Colors**:
  - Red: `#F85552` - Errors, alerts
  - Orange: `#F57D26` - Warnings
  - Yellow: `#DFA000` - Cautions, modified files
  - Green: `#8DA101` - Success, clean git status
  - Aqua: `#35A77C` - Info, constants
  - Blue: `#3A94C5` - Directories, links
  - Purple: `#DF69BA` - Special elements

## Installation & Usage

### Method 1: Direct Source (Recommended)
Add one of these lines to your `.zshrc`:

```bash
# For dark theme
source ~/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-everforest-dark.zsh

# For light theme
source ~/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-everforest-light.zsh
```

### Method 2: Copy to Home Directory
```bash
# For dark theme
cp ~/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-everforest-dark.zsh ~/.p10k.zsh

# For light theme
cp ~/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-everforest-light.zsh ~/.p10k.zsh
```

Then reload your shell:
```bash
source ~/.zshrc
```

## Features

### Color Mapping
- **Git Status**: Clean (green), modified (orange), untracked (yellow), staged (aqua), conflicts (red)
- **Command Status**: Success (green), error (red)
- **Environments**: Python/Conda (aqua), Node.js (green), Ruby (red), Go (aqua)
- **Cloud Services**: AWS (orange), Azure/GCloud (blue), Kubernetes (blue)
- **System Info**: Background jobs (aqua), execution time (yellow), context (grey)

### Prompt Style
- Clean, minimal design with semantic color usage
- Proper contrast ratios for readability
- Support for both true color and 256-color terminals
- Transient prompt support for cleaner history
- Instant prompt compatibility

### Segments Included
- OS icon
- Current directory with intelligent truncation
- Git status with detailed information
- Command execution time
- Background jobs indicator
- Development environment indicators (Python, Node.js, Ruby, Go, etc.)
- Cloud service contexts (AWS, Azure, GCloud, Kubernetes)
- User context (user@hostname)

## Customization

Both configuration files are fully customizable. You can:

1. **Modify Colors**: Change any color variable at the top of the file
2. **Add/Remove Segments**: Edit the `POWERLEVEL9K_LEFT_PROMPT_ELEMENTS` and `POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS` arrays
3. **Adjust Behavior**: Modify segment-specific settings like git icons, directory truncation, etc.

## Color Palette Reference

### Dark Theme Palette
```
Background Colors:
- bg_dim:    #232A2E  - Dimmed background
- bg0:       #2D353B  - Default background
- bg1:       #343F44  - Cursor line, segments
- bg2:       #3D484D  - Popup menus
- bg3:       #475258  - Inactive elements
- bg4:       #4F585E  - Separators
- bg5:       #56635f  - (Reserved)

Semantic Backgrounds:
- bg_visual: #543A48  - Visual selection
- bg_red:    #514045  - Error highlights
- bg_yellow: #4D4C43  - Warning highlights
- bg_green:  #425047  - Success highlights
- bg_blue:   #3A515D  - Info highlights
- bg_purple: #4A444E  - Special highlights

Foreground Colors:
- fg:        #D3C6AA  - Default text
- red:       #E67E80  - Errors, keywords
- orange:    #E69875  - Warnings, operators
- yellow:    #DBBC7F  - Types, special chars
- green:     #A7C080  - Strings, success
- aqua:      #83C092  - Constants, info
- blue:      #7FBBB3  - Identifiers, links
- purple:    #D699B6  - Numbers, special
- grey0:     #7A8478  - Line numbers
- grey1:     #859289  - Comments, borders
- grey2:     #9DA9A0  - Cursor line numbers
```

### Light Theme Palette
```
Background Colors:
- bg_dim:    #EFEBD4  - Dimmed background
- bg0:       #FDF6E3  - Default background
- bg1:       #F4F0D9  - Cursor line, segments
- bg2:       #EFEBD4  - Popup menus
- bg3:       #E6E2CC  - Inactive elements
- bg4:       #E0DCC7  - Separators
- bg5:       #BDC3AF  - (Reserved)

Semantic Backgrounds:
- bg_visual: #EAEDC8  - Visual selection
- bg_red:    #FDE3DA  - Error highlights
- bg_yellow: #FAEDCD  - Warning highlights
- bg_green:  #F0F1D2  - Success highlights
- bg_blue:   #E9F0E9  - Info highlights
- bg_purple: #FAE8E2  - Special highlights

Foreground Colors:
- fg:        #5C6A72  - Default text
- red:       #F85552  - Errors, keywords
- orange:    #F57D26  - Warnings, operators
- yellow:    #DFA000  - Types, special chars
- green:     #8DA101  - Strings, success
- aqua:      #35A77C  - Constants, info
- blue:      #3A94C5  - Identifiers, links
- purple:    #DF69BA  - Numbers, special
- grey0:     #A6B0A0  - Line numbers
- grey1:     #939F91  - Comments, borders
- grey2:     #829181  - Cursor line numbers
```

## Compatibility

- **Zsh Version**: 5.1 or higher
- **Powerlevel10k**: All versions
- **Terminal**: Any terminal with 256-color or true color support
- **Font**: Works with any Nerd Font (recommended: MesloLGS NF)

## Credits

- **Everforest Color Scheme**: [sainnhe/everforest](https://github.com/sainnhe/everforest)
- **Powerlevel10k**: [romkatv/powerlevel10k](https://github.com/romkatv/powerlevel10k)
- **Configuration**: Based on the official Powerlevel10k lean and pure configurations