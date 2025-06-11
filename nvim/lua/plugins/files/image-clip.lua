return {
  -- support for image pasting
  'HakonHarnes/img-clip.nvim',
  event = 'VeryLazy',
  opts = {
    -- recommended settings
    default = {
      embed_image_as_base64 = false,
      prompt_for_file_name = false,
      drag_and_drop = {
        insert_mode = true,
      },
      dir_path = 'attachments',
      -- required for Windows users
      use_absolute_path = true,
      only_render_image_at_cursor = true,
    },
  },
  keys = {
    -- suggested keymap
    { '<leader>pi', '<cmd>PasteImage<cr>', desc = 'Paste image from system clipboard' },
  },
}
