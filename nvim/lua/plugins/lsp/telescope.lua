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
        live_grep_args = {
          auto_quoting = true, -- enable/disable auto-quoting
          mappings = { -- extend mappings
            i = {
              ['<C-k>'] = require('telescope-live-grep-args.actions').quote_prompt(),
              ['<C-i>'] = require('telescope-live-grep-args.actions').quote_prompt { postfix = ' --iglob ' },
            },
          },
        },
      },
    }

    -- Enable telescope fzf native, if installed
    require('telescope').load_extension 'fzf'

    -- Enable projects
    require('telescope').load_extension 'projects'

    -- Enable live grep
    require('telescope').load_extension 'live_grep_args'
  end,
  dependencies = {
    'nvim-lua/plenary.nvim',
    {
      'nvim-telescope/telescope-fzf-native.nvim',
      build = 'make',
    },
    {
      'nvim-telescope/telescope-live-grep-args.nvim',
      -- This will not install any breaking changes.
      -- For major updates, this must be adjusted manually.
      version = '^1.0.0',
    },
  },
  keys = {
    { '<C-f>', ':Telescope live_grep_args<cr>', desc = '[S]earch by [G]rep', mode = 'n' },
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
    {
      '<leader>ote',
      function()
        -- Run tsc with no emit and pretty false
        local cmd = 'npx tsc --noEmit --pretty false'
        local output = vim.fn.systemlist(cmd)

        -- Create a table for the quickfix list
        local qflist = {}

        -- Process each line of the output
        for _, line in ipairs(output) do
          -- Match the file, line, column, and message from the error output
          local filename, lnum, col, msg = line:match '([%w/.-]+)%((%d+),(%d+)%): error ([A-Z%d]+): (.+)'
          if filename and lnum and col and msg then
            -- Insert the error into the quickfix list
            table.insert(qflist, {
              filename = filename,
              lnum = tonumber(lnum),
              col = tonumber(col),
              text = msg,
              type = 'E', -- Error type
            })
          end
        end

        -- If there are any errors, populate the quickfix list
        if #qflist == 0 then
          print 'No TypeScript errors found.'
        else
          vim.fn.setqflist(qflist, 'r') -- Replace the quickfix list
          print('Added ' .. #qflist .. ' TypeScript errors to quickfix list.')
          vim.cmd 'copen' -- Open quickfix window
        end
      end,
      silent = true,
      desc = 'Run tsc and add TypeScript errors to quickfix list',
      mode = { 'n', 'v' },
    },
  },
}
