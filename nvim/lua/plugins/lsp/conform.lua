local function biome_or_fallback(bufnr)
  local has_biome = vim.fs.find({ 'biome.json', 'biome.jsonc' }, {
    upward = true,
    path = vim.api.nvim_buf_get_name(bufnr),
  })[1]

  if has_biome then
    return { 'biome', 'biome-organize-imports' }
  end

  return { 'prettierd', lsp_format = 'fallback' }
end

return {
  { -- Autoformat
    'stevearc/conform.nvim',
    opts = {
      notify_on_error = false,
      format_on_save = {
        timeout_ms = 500,
        lsp_format = 'fallback',
      },
      formatters_by_ft = {
        lua = { 'stylua' },
        typescriptreact = biome_or_fallback,
        typescript = biome_or_fallback,
        javascript = biome_or_fallback,
        javascriptreact = biome_or_fallback,
        json = biome_or_fallback,
      },
    },
  },
}
