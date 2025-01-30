return {
  'nvim-telescope/telescope.nvim',
  config = function()
    require('telescope').setup {
      event = 'VimEnter',
      defaults = {
        mappings = {
          i = {
            ['<C-u>'] = false,
            ['<C-d>'] = false,
          },
        },
        file_ignore_patterns = {
          'node_modules',
          'public/map',
        },
      },
      extensions = {
        fzf = {
          fuzzy = true, -- false will only do exact matching
          override_generic_sorter = true, -- override the generic sorter
          override_file_sorter = true, -- override the file sorter
          case_mode = 'smart_case', -- or "ignore_case" or "respect_case"
          -- the default case_mode is "smart_case"
        },
      },
    }

    -- Enable telescope fzf native, if installed
    require('telescope').load_extension 'fzf'

    -- Enable projects
    require('telescope').load_extension 'projects'
  end,
  dependencies = {
    'nvim-lua/plenary.nvim',
    {
      'nvim-telescope/telescope-fzf-native.nvim',
      build = 'make',
    },
  },
  keys = {
    { '<C-f>', ':Telescope live_grep<cr>', desc = '[S]earch by [G]rep', mode = 'n' },
    { '<leader><space>', ':Telescope git_files<cr>', desc = 'Search [G]it [F]iles', mode = 'n' },
    { '<leader>fb', ':Telescope buffers<cr>', desc = 'Search Buffers', mode = 'n' },
    {
      '<leader>sn',
      function()
        local builtin = require 'telescope.builtin'
        builtin.find_files { cwd = vim.fn.stdpath 'config' }
      end,
      '[S]earch [N]eovim files',
      mode = 'n',
    },
    { '<leader>sh', ':Telescope help_tags<cr>', desc = '[S]earch [H]elp', mode = 'n' },
    { '<leader>sd', ':Telescope diagnostics<cr>', desc = '[S]earch [D]iagnostics', mode = 'n' },
    { '<leader>?', ':Telescope oldfiles<cr>', desc = '[?] Find recently opened files', mode = 'n' },
    { '<leader>/', ':Telescope current_buffer_fuzzy_find fuzzy=false case_mode=ignore_case<cr>', desc = '[/] Fuzzily search in current buffer', mode = 'n' },
    { 'gr', ':Telescope lsp_references<cr>', desc = '[G]oto [R]eferences' },
    { '<leader>ds', ':Telescope lsp_document_symbols<cr>', desc = '[D]ocument [S]ymbols' },
    { '<leader>ws', ':Telescope lsp_dynamic_workspace_symbols<cr>', desc = '[W]orkspace [S]ymbols' },
    {
      '<leader>os',
      ':Telescope npm scripts<cr>',
      silent = true,
      desc = 'Open npm scripts, with C-x in horizontal split',
      mode = { 'n', 'v' },
    },
    {
      '<leader>op',
      ':Telescope projects<CR>',
      silent = true,
      desc = 'Open projects',
      mode = { 'n', 'v' },
    },
    {
      '<leader>or',
      ':Telescope registers<CR>',
      silent = true,
      desc = 'Open registers',
      mode = { 'n', 'v' },
    },
    {
      '<leader>olp',
      ':Telescope resume<CR>',
      silent = true,
      desc = 'Open last picker',
      mode = { 'n', 'v' },
    },
  },
}
