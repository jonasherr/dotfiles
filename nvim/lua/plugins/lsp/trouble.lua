return {
	"folke/trouble.nvim",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	opts = {
		-- your configuration comes here
		-- or leave it empty to use the default settings
		-- refer to the configuration section below
		mode = "workspace_diagnostics",
		severity = "ERROR",
		vim.keymap.set("n", "<leader>xw",
			function() require("lua.plugins.lsp.trouble").toggle("workspace_diagnostics") end)
	}
}
