return {
	-- Setup neovim lua configuration
	'neodev',
	-- NOTE: First, some plugins that don't require any configuration

	-- Git related plugins
	'tpope/vim-fugitive',

	-- Detect tabstop and shiftwidth automatically
	'tpope/vim-sleuth',

	{
		-- Add indentation guides even on blank lines
		'lukas-reineke/indent-blankline.nvim',
		-- Enable `lukas-reineke/indent-blankline.nvim`
		-- See `:help indent_blankline.txt`
		main = "ibl",
		opts = {
		},
	},

	{
		'numToStr/Comment.nvim',
		opts = {},
		lazy = false,
	},

	'nvim-lua/plenary.nvim',
	'mbbill/undotree',
	'idanarye/vim-merginal',
	'nvim-tree/nvim-web-devicons',
	{
		'preservim/nerdtree',
		keys = {
			{ "<leader>of", ":NERDTree %<CR>", silent = true, desc = 'Open file', mode = { "n", "v" } }
		}
	},
	{
		'ahmedkhalf/project.nvim',
		config = function()
			require('project_nvim').setup({})
		end
	}
}
