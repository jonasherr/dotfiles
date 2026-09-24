local map = vim.keymap.set

-- Navigate Neovim windows first. At an edge, ask Herdr to focus its neighbor.
local herdr_directions = { h = 'left', j = 'down', k = 'up', l = 'right' }

local function navigate(direction, herdr_direction)
  local target = vim.fn.winnr(direction)
  if target ~= 0 and vim.fn.win_getid(target) ~= vim.api.nvim_get_current_win() then
    vim.cmd('wincmd ' .. direction)
    return
  end

  local pane_id = vim.env.HERDR_PANE_ID
  local binary = vim.env.HERDR_BIN_PATH
  if not binary or binary == '' or vim.fn.executable(binary) ~= 1 then
    binary = vim.fn.exepath 'herdr'
  end

  if not pane_id or pane_id == '' or binary == '' then
    return
  end

  vim.system({ binary, 'pane', 'focus', '--pane', pane_id, '--direction', herdr_direction }, { text = true })
end

for key, direction in pairs { h = 'h', j = 'j', k = 'k', l = 'l' } do
  local herdr_direction = herdr_directions[key]
  map({ 'n', 'v' }, '<C-' .. key .. '>', function()
    navigate(direction, herdr_direction)
  end, { silent = true, desc = 'Navigate ' .. direction })
end

-- S = Shift
-- C = CTRL
-- D = CMD
-- A = ALT
-- for more infos write :help key-notation

map({ 'n', 'v', 'i' }, '<C-s>', function()
  vim.api.nvim_command 'write'
end, { silent = true, desc = 'Save' })

-- Open Commands
map({ 'n', 'v' }, '<leader>ou', ':UndotreeToggle<CR>', { silent = true, desc = 'Open Undotree' })

map({ 'n', 'v' }, '<leader>qn', ':cnext<CR>', { silent = true, desc = 'Next Quick List Item' })
map({ 'n', 'v' }, '<leader>qp', ':cprevious<CR>', { silent = true, desc = 'Previous Quick List Item' })

vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Open floating diagnostic message' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostics list' })

vim.keymap.set('v', 'K', ":m '<-2<CR>gv=gv") -- Move lin vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")

-- Keeps cursor centered
vim.keymap.set('n', '<C-d>', '<C-d>zz')
vim.keymap.set('n', '<C-u>', '<C-u>zz')

-- pasting without saving of selected text
vim.keymap.set('x', '<leader>p', [["_dP]])

map({ 'n' }, 'Q', ':q<CR>', { desc = 'Close nvim' })

-- replaces everywhere that is selected
vim.keymap.set('n', '<leader>sr', [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]])

-- [[ Basic Keymaps ]]

-- Keymaps for better default experience
-- See `:help vim.keymap.set()`
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Remap for dealing with word wrap
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

-- Diagnostic keymaps
local function goToPreviousDiagnosticMessage()
  vim.diagnostic.jump { count = -1, float = true }
end
vim.keymap.set('n', 'gE', goToPreviousDiagnosticMessage, { desc = 'Go to previous diagnostic message' })
local function goToNextDiagnosticMessage()
  vim.diagnostic.jump { count = 1, float = true }
end
vim.keymap.set('n', 'ge', goToNextDiagnosticMessage, { desc = 'Go to next diagnostic message' })

map('n', '<S-h>', '<cmd>bprevious<cr>', { desc = 'Prev buffer' })
map('n', '<S-l>', '<cmd>bnext<cr>', { desc = 'Next buffer' })
map('n', '<leader>bb', '<cmd>e #<cr>', { desc = 'Switch to Other Buffer' })

map('n', '<leader>ca', vim.lsp.buf.code_action, { desc = '[C]ode [A]ction' })

-- Markdown
map('n', '<A-j>', '/^#\\+ <CR>', { desc = 'Next Heading' })
map('n', '<A-k>', '?^#\\+ <CR>', { desc = 'Previous Heading' })

-- Rename
map({ 'n', 'v' }, '<leader>rn', vim.lsp.buf.rename, { desc = '[R]e[n]ame' })

-- See `:help K` for why this keymap
map({ 'n', 'v' }, 'K', vim.lsp.buf.hover, { desc = 'Hover Documentation' })
