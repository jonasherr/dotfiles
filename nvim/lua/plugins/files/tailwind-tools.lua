return {
  'luckasRanarison/tailwind-tools.nvim',
  lazy = true,
  name = 'tailwind-tools',
  build = ':UpdateRemotePlugins',
  dependencies = {
    'nvim-treesitter/nvim-treesitter',
    'folke/snacks.nvim',
    'neovim/nvim-lspconfig', -- optional
  },
  opts = {},
  keys = {
    { '<leader>ts', ':TailwindSort<cr>', desc = 'Tailwind sort all classes', mode = { 'n', 'v' } },
    { '<leader>tc', ':TailwindColorToggle<cr>', desc = 'Tailwind enable inline color', mode = { 'n', 'v' } },
  },
}
