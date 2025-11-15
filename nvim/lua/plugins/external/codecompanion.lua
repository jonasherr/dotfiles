local prompt_library = require 'prompt_library'

return {
  'olimorris/codecompanion.nvim',
  lazy = true,
  opts = {
    log_level = 'DEBUG',
    prompt_library = prompt_library,
    extensions = {
      history = {
        enabled = true,
        opts = {
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
            adapter = 'openai', -- e.g "copilot"
            ---Model for generating titles (defaults to active chat's model)
            model = 'gpt-4.1-mini', -- e.g "gpt-4o"
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
      mcphub = {
        callback = 'mcphub.extensions.codecompanion',
        opts = {
          -- MCP Tools
          make_tools = true, -- Make individual tools (@server__tool) and server groups (@server) from MCP servers
          show_server_tools_in_chat = true, -- Show individual tools in chat completion (when make_tools=true)
          add_mcp_prefix_to_tool_names = false, -- Add mcp__ prefix (e.g `@mcp__github`, `@mcp__neovim__list_issues`)
          show_result_in_chat = true, -- Show tool results directly in chat buffer
          format_tool = nil, -- function(tool_name:string, tool: CodeCompanion.Agent.Tool) : string Function to format tool names to show in the chat buffer
          -- MCP Resources
          make_vars = true, -- Convert MCP resources to #variables for prompts
          -- MCP Prompts
          make_slash_commands = true, -- Add MCP prompts as /slash commands
        },
      },
    },
    strategies = {
      chat = {
        adapter = 'openai',
        slash_commands = {
          buffer = {
            opts = {
              provider = 'snacks',
            },
          },
          file = {
            opts = {
              provider = 'snacks',
            },
          },
          help = {
            opts = {
              provider = 'snacks',
            },
          },
          symbols = {
            opts = {
              provider = 'snacks',
            },
          },
        },
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
        auto_scroll = true,
        show_settings = false,
      },
      action_palette = {
        width = 200,
        height = 400,
        prompt = 'Prompt ', -- Prompt used for interactive LLM calls
        provider = 'snacks', -- Can be "default", "telescope", "fzf_lua", "mini_pick" or "snacks". If not specified, the plugin will autodetect installed providers.
        opts = {
          show_default_actions = true, -- Show the default actions in the action palette?
          show_default_prompt_library = true, -- Show the default prompt library in the action palette?
        },
      },
    },
    adapters = {
      opts = {
        show_defaults = false,
        show_model_choices = true,
      },
      anthropic = function()
        return require('codecompanion.adapters').extend('anthropic', {
          env = {
            api_key = 'cmd:op read op://Private/AnthropicApiKey/credential --no-newline',
          },
        })
      end,
      ollama = function()
        return require('codecompanion.adapters').extend('ollama', {
          parameters = {
            sync = true,
          },
        })
      end,
      v0 = function()
        return require('codecompanion.adapters').extend('openai_compatible', {
          roles = {
            llm = 'assistant',
            user = 'user',
          },
          opts = {
            stream = false,
          },
          features = {
            text = true,
            tokens = true,
            vision = true,
          },
          env = {
            url = 'https://api.v0.dev',
            api_key = 'cmd:op read op://Private/v0token/credential --no-newline',
            chat_url = '/v1/chat/completions',
            models_endpoint = '/v1/models',
          },
          schema = {
            model = {
              default = 'v0-1.5-md',
            },
          },
        })
      end,
      openai = function()
        return require('codecompanion.adapters').extend('openai', {
          env = {
            api_key = 'cmd:op read op://Private/OpenAIApiKey/credential --no-newline',
          },
          schema = {
            model = {
              default = 'gpt-4.1',
            },
          },
        })
      end,
      tavily = function()
        return require('codecompanion.adapters').extend('tavily', {
          name = 'tavily',
          formatted_name = 'Tavily',
          env = {
            api_key = 'cmd:op read op://Private/tavilyApiKey/credential --no-newline',
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
