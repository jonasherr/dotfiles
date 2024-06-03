# My personal kickstart.nvim config

This is my nvim config that I use as a TypeScript developer.
The config was initially based on kickstart.nvim and was extended and adjusted for my personal use.
The instructions below are basically the same as you find them on kickstart.nvim, but adjusted to the changes I made.

Feel free to use it as a starting point for your own configuration.

## Installation

* Backup your previous configuration (if any exists)

### Archive Installation
* On the home/landing page for the project find the blue "<> CODE" button click it and select Local > Download ZIP.
* Extract the archive to:
  `~/.config/nvim` (Linux)
  `~/.config/nvim` (MacOS)
  `%userprofile%\AppData\Local\nvim\` (Windows)
* Ensure your extraction method did not extract with a parent folder. For example in ~/.config/nvim you should have init.lua not another folder called kickstart.nvim.

### Git Clone Installation
* From a terminal cd/dir to:
    `~/.config/nvim` (Linux)
    `~/.config/nvim` (MacOS)
    `%userprofile%\AppData\Local\nvim\` (Windows)

* run: `git clone https://github.com/jonasherr/kickstart.nvim.git ~/.config/nvim` OR: `gh repo clone jonasherr/kickstart.nvim`
* Run Neovim (from terminal or shortcut) and allow lazy.nvim to download files and set up the basics.
* Once the setup is complete, restart Neovim.
* **You're ready to go!**

* (Recommended/Optional) Fork this repo (so that you have your own copy that you can modify).
* Clone the kickstart repo into `$HOME/.config/nvim/` (Linux/Mac) or `%userprofile%\AppData\Local\nvim\` (Windows)
  * If you don't want to include it as a git repo, you can just clone it and then move the files to this location

Additional system requirements:
- Make sure to review the readmes of the plugins if you are experiencing errors. In particular:
  - [ripgrep](https://github.com/BurntSushi/ripgrep#installation) is required for multiple [telescope](https://github.com/nvim-telescope/telescope.nvim#suggested-dependencies) pickers.
- See [Windows Installation](#Windows-Installation) if you have trouble with `telescope-fzf-native`

## Configuration And Extension

* Inside of your copy, feel free to modify any file you like! It's your copy!
* Feel free to change any of the default options in `init.lua` to better suit your needs.
* For adding plugins, there are 2 primary options:
  * Add new configuration in `lua/plugins/*` files, which will be auto sourced using `lazy.nvim`
  * Modify `init.lua` with additional plugins.

You can also merge updates/changes from the repo back into your fork, to keep up-to-date with any changes for the default configuration.

## FAQ

* What should I do if I already have a pre-existing neovim configuration?
  * You should back it up, then delete all files associated with it.
  * This includes your existing init.lua and the neovim files in `~/.local` which can be deleted with `rm -rf ~/.local/share/nvim/`
  * You may also want to look at the [migration guide for lazy.nvim](https://github.com/folke/lazy.nvim#-migration-guide)
* What if I want to "uninstall" this configuration:
  * See [lazy.nvim uninstall](https://github.com/folke/lazy.nvim#-uninstalling) information
* Are there any cool videos about this plugin?
  * Current iteration of kickstart (coming soon)
  * Here is one about the previous iteration of kickstart: [video introduction to Kickstart.nvim](https://youtu.be/stqUbv-5u2s). Note the install via init.lua no longer works as specified. Please follow the install instructions in this file instead as they're up to date.

## Windows Installation

Installation may require installing build tools, and updating the run command for `telescope-fzf-native`

See `telescope-fzf-native` documentation for [more details](https://github.com/nvim-telescope/telescope-fzf-native.nvim#installation)

This requires:

- Install CMake, and the Microsoft C++ Build Tools on Windows

```lua
{'nvim-telescope/telescope-fzf-native.nvim', build = 'cmake -S. -Bbuild -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release && cmake --install build --prefix build' }
```

