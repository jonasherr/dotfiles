local prompt_library = {
  ['Code Expert'] = {
    strategy = 'chat',
    description = 'Get some special advice from an LLM',
    opts = {
      short_name = 'expert',
      stop_context_insertion = true,
      user_prompt = true,
      is_slash_cmd = true,
      is_default = true,
    },
    prompts = {
      {
        role = 'system',
        content = function(context)
          return 'I want you to act as a senior '
            .. context.filetype
            .. ' developer. I will ask you specific questions and I want you to return concise explanations and codeblock examples.'
        end,
      },
      {
        role = 'user',
        content = function(context)
          local text = require('codecompanion.helpers.actions').get_code(context.start_line, context.end_line)

          return 'I have the following code:\n\n```' .. context.filetype .. '\n' .. text .. '\n```\n\n'
        end,
        opts = {
          contains_code = true,
        },
      },
    },
  },
  ['My New Prompt'] = {
    strategy = 'chat',
    description = 'Some cool custom prompt you can do',
    prompts = {
      {
        role = 'system',
        content = 'You are an experienced developer with Lua and Neovim',
      },
      {
        role = 'user',
        content = 'Can you explain why ...',
      },
    },
  },
}

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
      vectorcode = {
        ---@type VectorCode.CodeCompanion.ExtensionOpts
        opts = {
          tool_group = {
            -- this will register a tool group called `@vectorcode_toolbox` that contains all 3 tools
            enabled = true,
            -- a list of extra tools that you want to include in `@vectorcode_toolbox`.
            -- if you use @vectorcode_vectorise, it'll be very handy to include
            -- `file_search` here.
            extras = {},
            collapse = false, -- whether the individual tools should be shown in the chat
          },
          tool_opts = {
            ---@type VectorCode.CodeCompanion.ToolOpts
            ['*'] = {},
            ---@type VectorCode.CodeCompanion.LsToolOpts
            ls = {},
            ---@type VectorCode.CodeCompanion.VectoriseToolOpts
            vectorise = {},
            ---@type VectorCode.CodeCompanion.QueryToolOpts
            query = {
              max_num = { chunk = -1, document = -1 },
              default_num = { chunk = 50, document = 10 },
              include_stderr = false,
              use_lsp = false,
              no_duplicate = true,
              chunk_mode = false,
              ---@type VectorCode.CodeCompanion.SummariseOpts
              summarise = {
                ---@type boolean|(fun(chat: CodeCompanion.Chat, results: VectorCode.QueryResult[]):boolean)|nil
                enabled = false,
                adapter = nil,
                query_augmented = true,
              },
            },
            files_ls = {},
            files_rm = {},
          },
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
        auto_scroll = false,
        show_settings = false,
      },
      action_palette = {
        width = 95,
        height = 100,
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
