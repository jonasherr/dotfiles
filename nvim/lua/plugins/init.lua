return {
  -- Setup neovim lua configuration
  -- 'neodev',
  -- NOTE: First, some plugins that don't require any configuration
  { import = 'plugins.external' },
  { import = 'plugins.files' },
  { import = 'plugins.git' },
  { import = 'plugins.lsp' },
  { import = 'plugins.styling' },
  { import = 'plugins.typescript' },

  'nvim-lua/plenary.nvim',
  'nvim-tree/nvim-web-devicons',
}
