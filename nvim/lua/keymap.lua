local map = vim.keymap.set

-- S = Shift
-- C = CTRL
-- D = CMD
-- A = ALT
-- for more infos write :help key-notation

map({ "n", "v", "i" }, "<C-s>", function()
	vim.api.nvim_command('write')
end, { silent = true, desc = "Save" })

-- Open Commands
map({ "n", "v" }, "<leader>ob", ":Merginal<CR>", { silent = true, desc = "Open branches" })
map({ "n", "v" }, "<leader>og", ":G ", { silent = true, desc = "Open Git" })
--map({ "n", "v" }, "<leader>ot", ":terminal ", { silent = true, desc = "Open terminal" })
map({ "n", "v" }, "<leader>ou", ":UndotreeToggle<CR>", { silent = true, desc = "Open Undotree" })
map({ "n", "v" }, "<leader>od", ":lua require('dbee').open()<CR>", { silent = true, desc = "Open dbee" })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv") -- Move lin vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")

-- Keeps cursor centered
vim.keymap.set("n", "J", "mzJ`z")
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")


-- pasting without saving of selected text
vim.keymap.set("x", "<leader>p", [["_dP]])


vim.keymap.set("n", "Q", "<nop>")
vim.keymap.set("n", "<A-f>", "<cmd>silent !tmux neww tmux-sessionizer<CR>")

-- replaces everywhere that is selected
vim.keymap.set("n", "<leader>s", [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]])

-- [[ Basic Keymaps ]]

-- Keymaps for better default experience
-- See `:help vim.keymap.set()`
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Remap for dealing with word wrap
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })


-- Diagnostic keymaps
vim.keymap.set('n', 'gE', vim.diagnostic.goto_prev, { desc = 'Go to previous diagnostic message' })
vim.keymap.set('n', 'ge', vim.diagnostic.goto_next, { desc = 'Go to next diagnostic message' })
vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Open floating diagnostic message' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostics list' })

map("n", "<S-h>", "<cmd>bprevious<cr>", { desc = "Prev buffer" })
map("n", "<S-l>", "<cmd>bnext<cr>", { desc = "Next buffer" })
map("n", "<leader>bb", "<cmd>e #<cr>", { desc = "Switch to Other Buffer" })
map("n", "<leader>`", "<cmd>e #<cr>", { desc = "Switch to Other Buffer" })

-- new file
map("n", "<leader>fn", "<cmd>enew<cr>", { desc = "New File" })

-- create new file at /Users/jonas/Library/Mobile Documents/iCloud~md~obsidian/Documents/Bear/inbox
map("n", "<leader>ci",
	"<cmd>edit ~/Library/Mobile\\ Documents/iCloud\\~md\\~obsidian/Documents/Bear/inbox/newnote.md<cr>",
	{ desc = "New File in Bear Inbox" })
