vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Set highlight on search
vim.o.hlsearch = false

-- Make line numbers default
vim.wo.number = true
vim.wo.relativenumber = true

-- Enable mouse mode
vim.o.mouse = 'a'

-- Sync clipboard between OS and Neovim.
--  Remove this option if you want your OS clipboard to remain independent.
--  See `:help 'clipboard'`
vim.o.clipboard = 'unnamedplus'

-- Enable break indent
vim.o.breakindent = true

-- Save undo history
vim.o.undofile = true

-- Case-insensitive searching UNLESS \C or capital in search
vim.o.ignorecase = true
vim.o.smartcase = true

-- Keep signcolumn on by default
vim.wo.signcolumn = 'yes'

-- Decrease update time
vim.o.updatetime = 250
vim.o.timeout = true
-- I increased this from 300 to 1000, because otherwise surround was not working
vim.o.timeoutlen = 1000

-- Set completeopt to have a better completion experience
vim.o.completeopt = 'menuone,noselect'

-- NOTE: You should make sure your terminal supports this
vim.o.termguicolors = true

-- [[ Highlight on yank ]]
-- See `:help vim.highlight.on_yank()`
local highlight_group = vim.api.nvim_create_augroup('YankHighlight', { clear = true })
vim.api.nvim_create_autocmd('TextYankPost', {
  callback = function()
    vim.highlight.on_yank()
  end,
  group = highlight_group,
  pattern = '*',
})

-- folding
vim.o.foldenable = true -- Enable folding.
vim.o.foldcolumn = '1' -- Show folding signs.
vim.o.foldexpr = 'v:lua.vim.treesitter.foldexpr()' -- Use treesitter for folding.
vim.o.foldlevel = 999 -- Close all folds.
vim.o.foldlevelstart = 99 -- Start with all folds closed.
vim.o.foldmethod = 'expr' -- Use expr to determine fold level.
vim.o.foldopen = 'insert,mark,search,tag' -- Which commands open folds if the cursor moves into a closed fold.
--
