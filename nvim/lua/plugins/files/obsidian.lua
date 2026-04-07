-- Creates the weekly note for the current week under projects/planning/weekly/YYYY/KW NN.md.
-- Only embeds daily notes that actually exist on disk.
local function create_weekly_note()
  local vault = vim.fn.expand '$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes'
  local t = os.time()
  local wday = tonumber(os.date('%w', t)) -- 0=Sun, 1=Mon … 6=Sat

  -- Anchor on yesterday: the weekly note always reviews the week that just finished,
  -- which includes yesterday regardless of what day of the week today is.
  local yesterday = t - 86400
  local ywday = tonumber(os.date('%w', yesterday)) -- 0=Sun, 1=Mon … 6=Sat

  -- Find the Monday of the week containing yesterday.
  local days_since_monday = ywday == 0 and 6 or (ywday - 1)
  local last_monday = yesterday - days_since_monday * 86400

  -- ISO calendar week and year of that Monday.
  local kw   = tonumber(os.date('%V', last_monday))
  local year = tonumber(os.date('%G', last_monday)) -- ISO week-year (differs from %Y near Jan 1)

  -- Build list of embeds for daily notes that exist.
  local review_lines = {}
  for offset = 0, 6 do
    local day = last_monday + offset * 86400
    local rel = string.format('projects/planning/daily/%s/%s/%s.md',
      os.date('%Y', day), os.date('%m', day), os.date('%Y-%m-%d', day))
    local abs = vault .. '/' .. rel
    if vim.fn.filereadable(abs) == 1 then
      review_lines[#review_lines + 1] = string.format('![[%s/%s/%s]]',
        os.date('%Y', day), os.date('%m', day), os.date('%Y-%m-%d', day))
    end
  end
  if #review_lines == 0 then
    review_lines[1] = '*(no daily notes found for this week)*'
  end

  -- Target path: projects/planning/weekly/YYYY/KW NN.md
  local dir  = string.format('%s/projects/planning/weekly/%d', vault, year)
  local path = string.format('%s/KW %02d.md', dir, kw)

  if vim.fn.filereadable(path) == 1 then
    vim.cmd('edit ' .. vim.fn.fnameescape(path))
    return
  end

  vim.fn.mkdir(dir, 'p')

  local lines = {
    '---',
    string.format('id: %d-kw-%02d', year, kw),
    'aliases:',
    string.format('  - %d-kw-%02d', year, kw),
    'tags:',
    '  - weekly-planning',
    string.format('  - "%02d"', tonumber(os.date('%m', last_monday))),
    string.format('  - "%d"', year),
    string.format('  - kw-%02d', kw),
    '---',
    '',
    '## Weekly Planning',
    '',
    '- [ ] Scanned all documents and tagged them in Paperless',
    '- [ ] Did weekly budgeting',
    '- [ ] Planned private activities for the week',
    '- [ ] Updated This Week\'s Priorities in [[agent-current-focus]]',
    '- [ ] Checked [[agent-learnings-inbox|Obsidian inbox]] and processed notes',
    '',
    '## Week in Review',
    '',
  }
  for _, l in ipairs(review_lines) do
    lines[#lines + 1] = l
  end
  vim.list_extend(lines, { '', '## Week in Advance', '', '' })

  -- Write and open the file.
  vim.fn.writefile(lines, path)
  vim.cmd('edit ' .. vim.fn.fnameescape(path))
end

return {
  'obsidian-nvim/obsidian.nvim',
  version = '*', -- recommended, use latest release instead of latest commit
  lazy = true,
  ft = 'markdown',
  config = function(_, opts)
    require('obsidian').setup(opts)
    vim.api.nvim_create_user_command('WeeklyNote', create_weekly_note, { desc = 'Open or create this week\'s weekly note' })
  end,
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

    footer = {
      enabled = true,
      format = '{{backlinks}} backlinks  {{properties}} properties  {{words}} words  {{chars}} chars',
    },

    legacy_commands = false,

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
      checkboxes = {
        [' '] = { char = '󰄱', hl_group = 'ObsidianTodo' },
        ['x'] = { char = '', hl_group = 'ObsidianDone' },
      },
    },

    checkbox = {
      order = { ' ', 'x' },
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


  },
}
