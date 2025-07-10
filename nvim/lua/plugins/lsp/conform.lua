return {
  { -- Autoformat
    'stevearc/conform.nvim',
    opts = {
      notify_on_error = false,
      format_on_save = {
        timeout_ms = 500,
        lsp_format = 'never',
      },
      formatters_by_ft = {
        lua = { 'stylua' },
        typescriptreact = { 'biome', 'biome-organize-imports' },
        typescript = { 'biome', 'biome-organize-imports' },
        javascript = { 'biome', 'biome-organize-imports' },
        javascriptreact = { 'biome', 'biome-organize-imports' },
        json = { 'biome' },
      },
    },
  },
}
