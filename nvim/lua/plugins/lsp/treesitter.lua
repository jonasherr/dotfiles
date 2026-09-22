return {
  'nvim-treesitter/nvim-treesitter',
  branch = 'main',
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
      'bash',
      'css',
      'html',
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
