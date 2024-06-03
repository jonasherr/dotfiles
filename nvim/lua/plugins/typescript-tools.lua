return {
	"pmizio/typescript-tools.nvim",
	dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
	opts = {},
	keys = {
		{ "<leader>oi", ":TSToolsOrganizeImports<CR>", silent = true, desc = 'Organize imports', mode = { "n", "v" } }
	}
}
