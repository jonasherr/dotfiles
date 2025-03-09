return {
  'nvim-lualine/lualine.nvim',
  event = 'VeryLazy',
  dependencies = {
    -- Add any dependencies if needed
  },
  config = function()
    -- Token counter module
    local M = {}

    -- Function to count tokens (words) in the current buffer
    local function count_tokens()
      local filetype = vim.bo.filetype
      if filetype ~= 'markdown' and filetype ~= 'text' then
        return ''
      end

      local content = vim.api.nvim_buf_get_lines(0, 0, -1, false)
      local text = table.concat(content, ' ')

      -- Simple word counting (splitting by whitespace)
      local words = {}
      for word in text:gmatch '%S+' do
        table.insert(words, word)
      end

      return #words .. ' tokens'
    end

    -- Setup autocmd to refresh token count on relevant events
    local tokens_group = vim.api.nvim_create_augroup('TokenCounter', { clear = true })
    vim.api.nvim_create_autocmd({ 'BufEnter', 'TextChanged', 'TextChangedI' }, {
      group = tokens_group,
      pattern = { '*.md', '*.txt' },
      callback = function()
        -- This will trigger lualine update
        vim.cmd 'redrawstatus'
      end,
    })

    -- Configure lualine with token counter
    require('lualine').setup {
      sections = {
        lualine_x = {
          count_tokens,
          'encoding',
          'fileformat',
          'filetype',
        },
      },
    }
  end,
}
