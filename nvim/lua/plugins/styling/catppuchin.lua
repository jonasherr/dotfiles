return {
  'catppuccin/nvim',
  name = 'catppuccin',
  priority = 1000,
  config = function()
    vim.cmd.colorscheme 'catppuccin-frappe'
  end,
  opts = {
    flavour = 'frappe', -- latte, frappe, macchiato, mocha
    default_integrations = true,
    integrations = {
      cmp = true,
      gitsigns = true,
      treesitter = true,
      blink_cmp = true,
      dashboard = true,
      harpoon = true,
      markdown = true,
      mason = true,
      nvim_surround = true,
      render_markdown = true,
      snacks = true,
    },
  },
}
