local pickers = require 'telescope.pickers'
local finders = require 'telescope.finders'
local conf = require('telescope.config').values
local action_state = require 'telescope.actions.state'
local actions = require 'telescope.actions'

local function on_tsc_entry_selected(prompt_bufnr)
  local selection = action_state.get_selected_entry()
  actions.close(prompt_bufnr)
  if selection then
    local filename, row, col = string.match(selection.value, '(.+):(%d+):(%d+)')
    if filename then
      -- Open the file at the specific row and column
      vim.cmd(string.format(':e +%s %s', row, filename))
      vim.api.nvim_win_set_cursor(0, { tonumber(row), tonumber(col) })
    end
  end
end

local function run_tsc_and_show_in_telescope()
  -- Run `yarn tsc` and capture the output
  local tsc_output = vim.fn.systemlist 'pnpm tsc --noEmit'
  if vim.v.shell_error ~= 0 then
    print 'Error running pnpm tsc. Check your setup.'
    return
  end

  -- Filter the output to get file paths with line and column numbers
  local entries = {}
  for _, line in ipairs(tsc_output) do
    if string.match(line, '^%s*(.+):(%d+):(%d+)') then
      table.insert(entries, line)
    end
  end

  -- Create and display the picker
  pickers
    .new({}, {
      prompt_title = 'TypeScript Errors',
      finder = finders.new_table {
        results = entries,
        entry_maker = function(entry)
          return {
            value = entry,
            display = entry,
            ordinal = entry,
          }
        end,
      },
      sorter = conf.generic_sorter {},
      attach_mappings = function(_, map)
        map('i', '<CR>', on_tsc_entry_selected)
        map('n', '<CR>', on_tsc_entry_selected)
        return true
      end,
    })
    :find()
end

-- To run this custom picker, you can call `run_tsc_and_show_in_telescope()` from a Neovim command or keybinding.
vim.api.nvim_create_user_command('TscTelescope', run_tsc_and_show_in_telescope, {})
