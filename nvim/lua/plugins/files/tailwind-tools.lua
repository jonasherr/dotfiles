return {
  'luckasRanarison/tailwind-tools.nvim',
  ft = { 'html', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue', 'svelte' },
  name = 'tailwind-tools',
  build = ':UpdateRemotePlugins',
  dependencies = {
    'nvim-treesitter/nvim-treesitter',
    'folke/snacks.nvim',
    'neovim/nvim-lspconfig', -- optional
  },
  opts = {
    server = {
      -- Neovim configures tailwindcss through vim.lsp.config().
      -- Do not let this plugin use the deprecated lspconfig framework.
      override = false,
    },
  },
  keys = {
    { '<leader>ts', ':TailwindSort<cr>', desc = 'Tailwind sort all classes', mode = { 'n', 'v' } },
    { '<leader>tc', ':TailwindColorToggle<cr>', desc = 'Tailwind enable inline color', mode = { 'n', 'v' } },
  },
}
