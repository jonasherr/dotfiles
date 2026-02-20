return {
  -- support for image pasting
  'HakonHarnes/img-clip.nvim',
  event = 'VeryLazy',
  opts = {
    default = {
      embed_image_as_base64 = false,
      prompt_for_file_name = false,
      drag_and_drop = {
        insert_mode = true,
      },
      dir_path = (os.getenv 'NOTES' or vim.fn.expand '~') .. '/attachments',
      use_absolute_path = false,
      relative_to_current_file = false,
    },
  },
  keys = {
    -- suggested keymap
    { '<leader>pi', '<cmd>PasteImage<cr>', desc = 'Paste image from system clipboard' },
  },
}
