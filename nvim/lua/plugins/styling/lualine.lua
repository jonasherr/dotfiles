return {
  -- Set lualine as statusline
  'nvim-lualine/lualine.nvim',
  dependencies = { 'nvim-tree/nvim-web-devicons' },
  -- See `:help lualine.txt`
  config = function()
    local function current_session_name()
      return require('auto-session.lib').current_session_name(true)
    end

    require('lualine').setup {
      options = {
        icons_enabled = true,
        theme = 'everforest',
        component_separators = '|',
        section_separators = { left = '', right = '' },
      },
      sections = {
        lualine_a = { { 'mode', separator = { left = '' }, right_padding = 2 } },
        lualine_b = { 'diagnostics', 'branch', current_session_name },
        lualine_c = { 'diff' },
        lualine_x = {
          'encoding',
          'filetype',
        },
        lualine_y = { 'progress', 'location' },
        lualine_z = { { 'filename', separator = { right = '' }, left_padding = 2 } },
      },
    }
  end,
}
