return { -- Useful plugin to show you pending keybinds.
	'folke/which-key.nvim',
	dependencies = {
		"echasnovski/mini.icons",
		"nvim-tree/nvim-web-devicons",
	},
	event = 'VimEnter', -- Sets the loading event to 'VimEnter'
	keys = {
		{ "<leader>r",  group = "[R]ename" },
		{ "<leader>r_", hidden = true },
	}
}
