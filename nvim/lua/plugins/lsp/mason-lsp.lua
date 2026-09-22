return {
  'mason-org/mason-lspconfig.nvim',
  opts = {
    automatic_enable = false,
  },
  dependencies = {
    {
      'mason-org/mason.nvim',
      opts = {
        ensure_installed = {
          'bash-language-server',
          'biome',
          'css-lsp',
          'harper-ls',
          'html-lsp',
          'lua-language-server',
          'tailwindcss-language-server',
          'yaml-language-server',
        },
      },
    },
    'neovim/nvim-lspconfig',
    'pmizio/typescript-tools.nvim',
  },
  config = function(_, opts)
    vim.lsp.config('harper_ls', {
      settings = {
        ['harper-ls'] = {
          linters = {
            ToDoHyphen = false,
            SentenceCapitalization = false,
          },
          isolateEnglish = true,
          markdown = {
            IgnoreLinkTitle = true,
          },
        },
      },
      filetypes = { 'markdown' },
    })
    require('mason-lspconfig').setup(opts)
    vim.lsp.enable { 'bashls', 'biome', 'cssls', 'harper_ls', 'html', 'lua_ls', 'tailwindcss', 'yamlls' }
  end,
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
