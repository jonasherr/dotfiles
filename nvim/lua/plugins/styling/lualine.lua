return {
	-- Set lualine as statusline
	'nvim-lualine/lualine.nvim',
	dependencies = { 'nvim-tree/nvim-web-devicons' },
	-- See `:help lualine.txt`
	opts = {
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
			lualine_x = { 'encoding', 'filetype' },
			lualine_y = { 'progress', 'location' },
			lualine_z = { 'filename' }
		},
	},
}
