return {
  'mason-org/mason-lspconfig.nvim',
  opts = {
    automatic_enable = true,
  },
  dependencies = {
    { 'mason-org/mason.nvim', opts = {} },
    'neovim/nvim-lspconfig',
    'pmizio/typescript-tools.nvim',
  },
}

-- Language Servers I installed
-- 'lua_ls',
-- 'vimls',
-- 'actionlint',
-- 'bash-language-server',
-- 'eslint-lsp',
-- 'graphql-language-service-cli',
-- 'lua-language-server',
-- 'prettier',
-- 'prettierd',
-- 'stylua',
-- 'tailwindcss-language-server',
