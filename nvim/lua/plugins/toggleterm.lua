return {
	{
		'akinsho/toggleterm.nvim',
		version = "*",
		config = true,
		keys = {
			{ "<leader>ot",  ":ToggleTerm<CR>",            silent = true, desc = 'Toggle terminal',        mode = { "n", "v" } },
			{ "<leader>o2t", ":2ToggleTerm<CR>",           silent = true, desc = 'Toggle terminal 2',      mode = { "n", "v" } },
			{ "<leader>o3t", ":3ToggleTerm<CR>",           silent = true, desc = 'Toggle terminal 3',      mode = { "n", "v" } },
			{ "<leader>ots", ":TermSelect<CR>",            silent = true, desc = 'Toggle terminal select', mode = { "n", "v" } },
			{ "<C-t>",       "<C-\\><C-n>:ToggleTerm<CR>", silent = true, noremap = true,                  desc = 'Hide terminal', mode = { "t" } }
		}
	}
}
