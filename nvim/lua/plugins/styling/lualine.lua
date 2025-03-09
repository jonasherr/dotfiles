return {
  -- Set lualine as statusline
  'nvim-lualine/lualine.nvim',
  dependencies = { 'nvim-tree/nvim-web-devicons' },
  -- See `:help lualine.txt`
  config = function()
    -- Token counter function with multiple estimation methods
    local function estimate_tokens(text)
      -- Word count
      local words = {}
      for word in text:gmatch '%S+' do
        table.insert(words, word)
      end
      local word_count = #words

      -- Character count (excluding whitespace)
      local char_count = 0
      for char in text:gmatch '%S' do
        char_count = char_count + 1
      end

      -- Calculate estimates
      local tokens_count_word_est = word_count / 0.75
      local tokens_count_char_est = char_count / 4.0

      local output = math.max(tokens_count_word_est, tokens_count_char_est)

      return math.floor(output)
    end

    local function count_tokens()
      local filetype = vim.bo.filetype
      if filetype ~= 'markdown' and filetype ~= 'text' then
        return ''
      end

      local content = vim.api.nvim_buf_get_lines(0, 0, -1, false)
      local text = table.concat(content, ' ')

      local token_count = estimate_tokens(text)
      return token_count .. ' tokens'
    end

    -- Setup autocmd to refresh token count on relevant events
    local tokens_group = vim.api.nvim_create_augroup('TokenCounter', { clear = true })
    vim.api.nvim_create_autocmd({ 'BufEnter', 'TextChanged', 'TextChangedI' }, {
      group = tokens_group,
      pattern = { '*.md', '*.txt' },
      callback = function()
        vim.cmd 'redrawstatus'
      end,
    })

    require('lualine').setup {
      options = {
        icons_enabled = true,
        theme = 'dracula',
        component_separators = '|',
        section_separators = '',
      },
      sections = {
        lualine_a = { 'mode' },
        lualine_b = { 'diagnostics', 'branch' },
        lualine_c = { 'diff' },
        lualine_x = { count_tokens, 'encoding', 'filetype' },
        lualine_y = { 'progress', 'location' },
        lualine_z = { 'filename' },
      },
    }
  end,
}
