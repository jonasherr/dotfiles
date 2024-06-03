return {
	'stevearc/dressing.nvim',
	opts = {
		input = {
			-- When true, <Esc> will close the modal
			insert_only = false,

			-- When true, input will start in insert mode.
			start_in_insert = false,

			-- Set to `false` to disable
			mappings = {
				n = {
					["<C-c>"] = "Close",
					["<CR>"] = "Confirm",
				},
				i = {
					["<C-c>"] = "Close",
					["<CR>"] = "Confirm",
					["<Up>"] = "HistoryPrev",
					["<Down>"] = "HistoryNext",
				},
			},
		}
	},
}
