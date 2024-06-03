return {
	"jackMort/ChatGPT.nvim",
	event = "VeryLazy",
	config = function()
		require("chatgpt").setup({
			api_key_cmd = "op read op://private/OpenAI/credential --no-newline",
			keymaps = {
				close = "<C-c>",
				yank_last = "<C-y>",
				yank_last_code = "<C-k>",
				scroll_up = "<C-u>",
				scroll_down = "<C-d>",
				new_session = "<C-n>",
				cycle_windows = "<Tab>",
				cycle_modes = "<C-f>",
				next_message = "<C-j>",
				prev_message = "<C-k>",
				select_session = "<CR>",
				rename_session = "r",
				delete_session = "d",
				draft_message = "<C-r>",
				edit_message = "e",
				delete_message = "d",
				toggle_settings = "<C-o>",
				toggle_sessions = "<C-p>",
				toggle_help = "<C-h>",
				toggle_message_role = "<C-r>",
				toggle_system_role_open = "<C-s>",
				stop_generating = "<C-x>",
			},
			openai_params = {
				model = "gpt-4",
				frequency_penalty = 0,
				presence_penalty = 0,
				max_tokens = 300,
				temperature = 0,
				top_p = 1,
				n = 1,
			},
			openai_edit_params = {
				model = "gpt-4",
				frequency_penalty = 0,
				presence_penalty = 0,
				temperature = 0,
				top_p = 1,
				n = 1,
			},
			actions_paths = { "~/.config/nvim/lua/plugins/chatgpt-actions.json" }
		})
	end,
	dependencies = {
		"MunifTanjim/nui.nvim",
		"nvim-lua/plenary.nvim",
		"nvim-telescope/telescope.nvim"
	},
	keys = {
		{ "<leader>oc", ":ChatGPT<cr>", desc = "Open ChatGPT", mode = "n" },
	},
}
