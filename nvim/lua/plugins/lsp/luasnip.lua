-- added to cmp in cmp.lua
return {
  'L3MON4D3/LuaSnip',
  dependencies = {
    'rafamadriz/friendly-snippets',
    -- config = function()
    --   require('luasnip.loaders.from_vscode').lazy_load()
    --   require('luasnip.loaders.from_vscode').lazy_load { paths = './custom-snippets/' }
    -- end,
    -- { dir = 'custom-snippets' } },
  },
  config = function()
    require('luasnip').filetype_extend('typescriptreact', { 'html' })
  end,
}
