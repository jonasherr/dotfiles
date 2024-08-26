return {
	{
		"ThePrimeagen/git-worktree.nvim",
		dependencies = { "nvim-telescope/telescope.nvim" },
		opts = {
			function()
				local telescope = require("lua.plugins.lsp.telescope")
				telescope.load_extension("git_worktree")
			end
		},

		keys = {
			{
				"<leader>cwt",
				function()
					require('lua.plugins.lsp.telescope').extensions.git_worktree.create_git_worktree()
				end,
				desc = "Create Worktree"
			},
			{
				"<leader>dwt",
				function()
					require('lua.plugins.lsp.telescope').extensions.git_worktree.delete_git_worktree()
				end,
				desc = "Create Worktree"
			},
			{
				"<leader>owt",
				function()
					require('lua.plugins.lsp.telescope').extensions.git_worktree.git_worktrees()
					-- <Enter> - switches to that worktree
					-- <c-d> - deletes that worktree
					-- <c-f> - toggles forcing of the next deletion end, desc = "Create Worktree" },
				end,
				desc = "Worktree Selection"
			} }
	}
}
