return {
  'lewis6991/gitsigns.nvim',
  event = { 'BufReadPre', 'BufNewFile' },
  opts = {
    signs = {
      add = { text = '▎' },
      change = { text = '▎' },
      delete = { text = '' },
      topdelete = { text = '' },
      changedelete = { text = '▎' },
      untracked = { text = '▎' },
    },
    signs_staged = {
      add = { text = '▏' },
      change = { text = '▏' },
      delete = { text = '' },
      topdelete = { text = '' },
      changedelete = { text = '▏' },
    },
    on_attach = function(bufnr)
      local gs = require 'gitsigns'

      local function map(mode, l, r, opts)
        opts = opts or {}
        opts.buffer = bufnr
        vim.keymap.set(mode, l, r, opts)
      end

      -- Navigation
      map('n', '<leader>ghn', function()
        if vim.wo.diff then
          vim.cmd.normal { ']c', bang = true }
        else
          gs.nav_hunk 'next'
        end
      end, { desc = 'Next hunk' })

      map('n', '<leader>ghp', function()
        if vim.wo.diff then
          vim.cmd.normal { '[c', bang = true }
        else
          gs.nav_hunk 'prev'
        end
      end, { desc = 'Previous hunk' })

      map('n', '<leader>ghN', function()
        gs.nav_hunk 'last'
      end, { desc = 'Last hunk' })

      map('n', '<leader>ghP', function()
        gs.nav_hunk 'first'
      end, { desc = 'First hunk' })

      -- Hunk actions
      map({ 'n', 'v' }, '<leader>ghs', gs.stage_hunk, { desc = 'Stage hunk' })
      map({ 'n', 'v' }, '<leader>ghr', gs.reset_hunk, { desc = 'Reset hunk' })
      map('n', '<leader>ghS', gs.stage_buffer, { desc = 'Stage buffer' })
      map('n', '<leader>ghR', gs.reset_buffer, { desc = 'Reset buffer' })
      map('n', '<leader>ghu', gs.undo_stage_hunk, { desc = 'Undo stage hunk' })
      map('n', '<leader>ghv', gs.preview_hunk, { desc = 'Preview hunk' })
      map('n', '<leader>ghi', gs.preview_hunk_inline, { desc = 'Preview hunk inline' })

      -- Blame
      map('n', '<leader>ghb', gs.toggle_current_line_blame, { desc = 'Toggle line blame' })
      map('n', '<leader>ghB', function()
        gs.blame_line { full = true }
      end, { desc = 'Blame line (full)' })

      -- Diff
      map('n', '<leader>ght', gs.diffthis, { desc = 'Diff this' })
      map('n', '<leader>ghT', function()
        gs.diffthis '~'
      end, { desc = 'Diff this ~' })

      -- Toggles
      map('n', '<leader>ghd', gs.toggle_deleted, { desc = 'Toggle deleted' })
      map('n', '<leader>ghw', gs.toggle_word_diff, { desc = 'Toggle word diff' })

      -- Text object
      map({ 'o', 'x' }, 'ih', ':<C-U>Gitsigns select_hunk<CR>', { desc = 'inner hunk' })
    end,
  },
}
