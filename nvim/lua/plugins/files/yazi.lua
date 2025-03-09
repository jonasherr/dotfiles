---@type LazySpec
return {
  'mikavilpas/yazi.nvim',
  event = 'VeryLazy',
  keys = {
    -- 👇 in this section, choose your own keymappings!
    {
      '<leader>ll',
      mode = { 'n', 'v' },
      '<cmd>Yazi<cr>',
      desc = 'Open yazi at the current file',
    },
    {
      -- Open in the current working directory
      '<leader>ycw',
      '<cmd>Yazi cwd<cr>',
      desc = "Open the file manager in nvim's working directory",
    },
    {
      -- NOTE: this requires a version of yazi that includes
      -- https://github.com/sxyazi/yazi/pull/1305 from 2024-07-18
      '<leader>yt',
      '<cmd>Yazi toggle<cr>',
      desc = 'Resume the last yazi session',
    },
  },
  ---@type YaziConfig
  opts = {
    -- the floating window scaling factor. 1 means 100%, 0.9 means 90%, etc.
    floating_window_scaling_factor = 0.8,
    -- if you want to open yazi instead of netrw, see below for more info
    open_for_directories = true,
    keymaps = {
      show_help = 'g?',
      open_file_in_vertical_split = '<c-v>',
      open_file_in_horizontal_split = '<c-x>',
      open_file_in_tab = '<c-t>',
      grep_in_directory = '<c-s>',
      replace_in_directory = '<c-g>',
      cycle_open_buffers = '<tab>',
      copy_relative_path_to_selected_files = '<c-y>',
      send_to_quickfix_list = '<c-q>',
      change_working_directory = '<c-\\>',
    },
  },
}
