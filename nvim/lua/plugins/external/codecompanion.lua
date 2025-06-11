return {
  'olimorris/codecompanion.nvim',
  lazy = true,
  opts = {
    extensions = {
      history = {
        enabled = true,
        opts = {
          -- Keymap to open history from chat buffer (default: gh)
          keymap = 'gh',
          -- Keymap to save the current chat manually (when auto_save is disabled)
          save_chat_keymap = 'sc',
          -- Save all chats by default (disable to save only manually using 'sc')
          auto_save = true,
          -- Number of days after which chats are automatically deleted (0 to disable)
          expiration_days = 0,
          -- Picker interface ("telescope" or "snacks" or "fzf-lua" or "default")
          picker = 'snacks',
          ---Automatically generate titles for new chats
          auto_generate_title = true,
          title_generation_opts = {
            ---Adapter for generating titles (defaults to active chat's adapter)
            adapter = nil, -- e.g "copilot"
            ---Model for generating titles (defaults to active chat's model)
            model = nil, -- e.g "gpt-4o"
          },
          ---On exiting and entering neovim, loads the last chat on opening chat
          continue_last_chat = false,
          ---When chat is cleared with `gx` delete the chat from history
          delete_on_clearing_chat = false,
          ---Directory path to save the chats
          dir_to_save = vim.fn.stdpath 'data' .. '/codecompanion-history',
          ---Enable detailed logging for history extension
          enable_logging = false,
        },
      },
    },
    strategies = {
      chat = {
        adapter = 'openai',
      },
      inline = {
        adapter = 'openai',
      },
      cmd = {
        adapter = 'openai',
      },
    },
    display = {
      chat = {
        auto_scroll = false,
      },
      action_palette = {
        width = 95,
        height = 100,
        prompt = 'Prompt ', -- Prompt used for interactive LLM calls
        provider = 'default', -- Can be "default", "telescope", "fzf_lua", "mini_pick" or "snacks". If not specified, the plugin will autodetect installed providers.
        opts = {
          show_default_actions = true, -- Show the default actions in the action palette?
          show_default_prompt_library = true, -- Show the default prompt library in the action palette?
        },
      },
    },
    adapters = {
      opts = {
        show_defaults = false,
      },
      openai = function()
        return require('codecompanion.adapters').extend('openai', {
          env = {
            api_key = 'cmd:op read op://Private/OpenAIApiKey/credential --no-newline',
          },
        })
      end,
    },
  },
  keys = {
    { '<leader>aa', ':CodeCompanionActions<cr>', desc = 'CodeCompanion Actions', mode = { 'n', 'v' } },
    { '<leader>at', ':CodeCompanionChat Toggle<cr>', desc = 'CodeCompanionChat', mode = { 'n', 'v' } },
    { 'ga', ':CodeCompanionChat Add<cr>', noremap = true, silent = true, mode = 'v' },
  },
  dependencies = {
    'nvim-lua/plenary.nvim',
    'nvim-treesitter/nvim-treesitter',
    'ravitemer/codecompanion-history.nvim',
    'folke/snacks.nvim',
  },
}
