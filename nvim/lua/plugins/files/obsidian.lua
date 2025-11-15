return {
  'obsidian-nvim/obsidian.nvim',
  version = '*', -- recommended, use latest release instead of latest commit
  lazy = true,
  ft = 'markdown',
  -- Replace the above line with this if you only want to load obsidian.nvim for markdown files in your vault:
  -- event = {
  --   -- If you want to use the home shortcut '~' here you need to call 'vim.fn.expand'.
  --   -- E.g. "BufReadPre " .. vim.fn.expand "~" .. "/my-vault/*.md"
  --   -- refer to `:h file-pattern` for more examples
  --   "BufReadPre path/to/my-vault/*.md",
  --   "BufNewFile path/to/my-vault/*.md",
  -- },
  dependencies = {
    -- Required.
    'nvim-lua/plenary.nvim',

    -- see below for full list of optional dependencies 👇
  },
  opts = {

    statusline = {
      enabled = true, -- turn it off
      format = '{{backlinks}} backlinks  {{properties}} properties  {{words}} words  {{chars}} chars', -- works like the template system
    },

    workspaces = {
      {
        name = 'personal',
        path = '$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes',
      },
    },
    attachments = {
      img_folder = 'attachments', -- This is the default
    },

    daily_notes = {
      -- Optional, if you keep daily notes in a separate directory.
      folder = 'projects/planning/daily',
      -- Optional, if you want to automatically insert a template from your template directory like 'daily.md'
      template = 'daily.md',
    },

    templates = {
      folder = 'areas/templates',
      date_format = '%Y-%m-%d',
      time_format = '%H:%M',
      -- A map for custom variables, the key should be the variable and the value a function
      substitutions = {
        yesterday = function()
          return os.date('%Y-%m-%d', os.time() - 86400)
        end,
        tomorrow = function()
          return os.date('%Y-%m-%d', os.time() + 86400)
        end,
        current_month = function()
          return os.date('%m', os.time())
        end,
        current_month_written = function()
          return os.date('%B', os.time())
        end,
        previous_month_written = function()
          local now = os.date '*t'
          local year = now.year
          local month = now.month - 1
          if month == 0 then
            month = 12
            year = year - 1
          end
          -- Use day=1 to avoid end-of-month rollover problems
          return os.date('%B', os.time { year = year, month = month, day = 1 })
        end,
        current_year = function()
          return os.date('%Y', os.time())
        end,
        current_calendar_week = function()
          return tonumber(os.date '%W')
        end,
      },
    },

    completion = {
      -- Enables completion using nvim_cmp
      nvim_cmp = false,
      -- Enables completion using blink.cmp
      blink = true,
      -- Trigger completion at 2 chars.
      min_chars = 2,
      -- Set to false to disable new note creation in the picker
      create_new = true,
    },
    -- https://github.com/rafamadriz/friendly-snippets/blob/main/snippets/markdown.json
    new_notes_location = 'notes_subdir',

    ui = {
      enable = false,
    },

    mappings = {
      -- Overrides the 'gf' mapping to work on markdown/wiki links within your vault.
      ['gf'] = {
        action = function()
          return require('obsidian').util.gf_passthrough()
        end,
        opts = { noremap = false, expr = true, buffer = true },
      },
      -- Toggle check-boxes.
      ['<leader>ch'] = {
        action = function()
          return require('obsidian').util.toggle_checkbox()
        end,
        opts = { buffer = true },
      },
      -- Smart action depending on context: follow link, show notes with tag, or toggle checkbox.
      ['<cr>'] = {
        action = function()
          return require('obsidian').util.smart_action()
        end,
        opts = { buffer = true, expr = true },
      },

      vim.keymap.set({ 'n', 'v' }, '<leader>oqs', ':ObsidianQuickSwitch<CR>', { silent = true, desc = 'Open ObsidianQuickSwitch' }),
    },

    -- Optional, by default when you use `:ObsidianFollowLink` on a link to an external
    -- URL it will be ignored but you can customize this behavior here.
    ---@param url string
    follow_url_func = function(url)
      -- Open the URL in the default web browser.
      vim.fn.jobstart { 'open', url } -- Mac OS
      -- vim.fn.jobstart({"xdg-open", url})  -- linux
      -- vim.cmd(':silent exec "!start ' .. url .. '"') -- Windows
      -- vim.ui.open(url) -- need Neovim 0.10.0+
    end,

    -- Optional, by default when you use `:ObsidianFollowLink` on a link to an image
    -- file it will be ignored but you can customize this behavior here.
    ---@param img string
    follow_img_func = function(img)
      vim.fn.jobstart { 'qlmanage', '-p', img } -- Mac OS quick look preview
      -- vim.fn.jobstart({"xdg-open", url})  -- linux
      -- vim.cmd(':silent exec "!start ' .. url .. '"') -- Windows
    end,

    -- Optional, set to true if you use the Obsidian Advanced URI plugin.
    -- https://github.com/Vinzent03/obsidian-advanced-uri
    use_advanced_uri = true,
  },
}
