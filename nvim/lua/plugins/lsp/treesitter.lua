return {
  'nvim-treesitter/nvim-treesitter',
  branch = 'main',
  dependencies = {
    {
      'nvim-treesitter/nvim-treesitter-textobjects',
      branch = 'main',
      init = function()
        vim.g.no_plugin_maps = true
      end,
      config = function()
        require('nvim-treesitter-textobjects').setup {
          select = {
            lookahead = true,
          },
          move = {
            set_jumps = true,
          },
        }

        local select = require 'nvim-treesitter-textobjects.select'
        vim.keymap.set({ 'x', 'o' }, 'aa', function()
          select.select_textobject('@parameter.outer', 'textobjects')
        end)
        vim.keymap.set({ 'x', 'o' }, 'ia', function()
          select.select_textobject('@parameter.inner', 'textobjects')
        end)
        vim.keymap.set({ 'x', 'o' }, 'af', function()
          select.select_textobject('@function.outer', 'textobjects')
        end)
        vim.keymap.set({ 'x', 'o' }, 'if', function()
          select.select_textobject('@function.inner', 'textobjects')
        end)
        vim.keymap.set({ 'x', 'o' }, 'ac', function()
          select.select_textobject('@class.outer', 'textobjects')
        end)
        vim.keymap.set({ 'x', 'o' }, 'ic', function()
          select.select_textobject('@class.inner', 'textobjects')
        end)

        local move = require 'nvim-treesitter-textobjects.move'
        vim.keymap.set('n', ']m', function()
          move.goto_next_start('@function.outer', 'textobjects')
        end)
        vim.keymap.set('n', ']]', function()
          move.goto_next_start('@class.outer', 'textobjects')
        end)
        vim.keymap.set('n', ']M', function()
          move.goto_next_end('@function.outer', 'textobjects')
        end)
        vim.keymap.set('n', '][', function()
          move.goto_next_end('@class.outer', 'textobjects')
        end)
        vim.keymap.set('n', '[m', function()
          move.goto_previous_start('@function.outer', 'textobjects')
        end)
        vim.keymap.set('n', '[[', function()
          move.goto_previous_start('@class.outer', 'textobjects')
        end)
        vim.keymap.set('n', '[M', function()
          move.goto_previous_end('@function.outer', 'textobjects')
        end)
        vim.keymap.set('n', '[]', function()
          move.goto_previous_end('@class.outer', 'textobjects')
        end)
      end,
    },
  },
  lazy = false,
  build = ':TSUpdate',
  config = function()
    local treesitter = require 'nvim-treesitter'
    local languages = {
      'c',
      'cpp',
      'go',
      'lua',
      'python',
      'rust',
      'tsx',
      'typescript',
      'javascript',
      'vimdoc',
      'vim',
      'markdown',
      'markdown_inline',
      'yaml',
    }

    treesitter.setup {
      install_dir = vim.fn.stdpath 'data' .. '/site',
    }

    vim.api.nvim_create_autocmd('FileType', {
      pattern = languages,
      callback = function(args)
        vim.treesitter.start(args.buf)
        vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
      end,
    })
  end,
}
