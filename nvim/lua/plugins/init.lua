return {
	-- Setup neovim lua configuration
	'neodev',
	-- NOTE: First, some plugins that don't require any configuration

	-- Git related plugins
	'tpope/vim-fugitive',
	'tpope/vim-rhubarb',

	-- Detect tabstop and shiftwidth automatically
	'tpope/vim-sleuth',

	-- Useful plugin to show you pending keybinds.
	{ 'folke/which-key.nvim',     opts = {} },

	-- Highlight todo, notes, etc in comments
	{ 'folke/todo-comments.nvim', event = 'VimEnter', dependencies = { 'nvim-lua/plenary.nvim' }, opts = { signs = false } },

	{
		-- Adds git releated signs to the gutter, as well as utilities for managing changes
		'lewis6991/gitsigns.nvim',
		opts = {
			-- See `:help gitsigns.txt`
			signs = {
				add = { text = '+' },
				change = { text = '~' },
				delete = { text = '_' },
				topdelete = { text = '‾' },
				changedelete = { text = '~' },
			},
			on_attach = function(bufnr)
				vim.keymap.set('n', '<leader>gp', require('gitsigns').prev_hunk,
					{ buffer = bufnr, desc = '[G]o to [P]revious Hunk' })
				vim.keymap.set('n', '<leader>gn', require('gitsigns').next_hunk,
					{ buffer = bufnr, desc = '[G]o to [N]ext Hunk' })
				vim.keymap.set('n', '<leader>ph', require('gitsigns').preview_hunk,
					{ buffer = bufnr, desc = '[P]review [H]unk' })
			end,
		},
	},

	{
		"navarasu/onedark.nvim",
		priority = 1000,
		config = function()
			vim.cmd.colorscheme 'onedark'
		end,
		opts = {
			style = "ool",
			toggle_style_key = "<leader>ts"
		}
	},

	{
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
	},

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

	-- Fuzzy Finder (files, lsp, etc)
	{ 'nvim-telescope/telescope.nvim', branch = '0.1.x', dependencies = { 'nvim-lua/plenary.nvim' } },

	-- Fuzzy Finder Algorithm which requires local dependencies to be built.
	-- Only load if `make` is available. Make sure you have the system
	-- requirements installed.
	{
		'nvim-telescope/telescope-fzf-native.nvim',
		-- NOTE: If you are having trouble with this installation,
		--       refer to the README for telescope-fzf-native for more instructions.
		build = 'make',
		cond = function()
			return vim.fn.executable 'make' == 1
		end,
	},

	{
		-- Highlight, edit, and navigate code
		'nvim-treesitter/nvim-treesitter',
		dependencies = {
			'nvim-treesitter/nvim-treesitter-textobjects',
		},
		build = ':TSUpdate',
	},


	'nvim-lua/plenary.nvim',
	'mbbill/undotree',
	'idanarye/vim-merginal',
	'elianiva/telescope-npm.nvim',
	'nvim-tree/nvim-web-devicons',
	'kylechui/nvim-surround',
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
