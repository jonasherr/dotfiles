return {
  'mason-org/mason-lspconfig.nvim',
  opts = {
    automatic_enable = true,
    servers = {
      -- https://www.reddit.com/r/neovim/comments/1j7ookn/comment/mgysste
      -- The hover window configuration for the diagnostics is done in lamw26wmal
      -- ~/github/dotfiles-latest/neovim/neobean/lua/config/autocmds.lua
      harper_ls = {
        enabled = true,
        filetypes = { 'markdown' },
        settings = {
          ['harper-ls'] = {
            userDictPath = '~/github/dotfiles-latest/neovim/neobean/spell/en.utf-8.add',
            linters = {
              ToDoHyphen = false,
              SentenceCapitalization = false,
              -- SpellCheck = true,
            },
            isolateEnglish = true,
            markdown = {
              -- [ignores this part]()
              -- [[ also ignores my marksman links ]]
              IgnoreLinkTitle = true,
            },
          },
        },
      },
    },
  },
  dependencies = {
    { 'mason-org/mason.nvim', opts = {
      ensure_installed = {
        'tailwindcss-language-server',
        'harper-ls',
      },
    } },
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
