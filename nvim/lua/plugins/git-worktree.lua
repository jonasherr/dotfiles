return {
	{
		"ThePrimeagen/git-worktree.nvim",
		dependencies = { "nvim-telescope/telescope.nvim" },
		opts = {
			function()
				local telescope = require("telescope")
				telescope.load_extension("git_worktree")
			end
		},

		keys = {
			{
				"<leader>cwt",
				function()
					require('telescope').extensions.git_worktree.create_git_worktree()
				end,
				desc = "Create Worktree"
			},
			{
				"<leader>dwt",
				function()
					require('telescope').extensions.git_worktree.delete_git_worktree()
				end,
				desc = "Create Worktree"
			},
			{
				"<leader>owt",
				function()
					require('telescope').extensions.git_worktree.git_worktrees()
					-- <Enter> - switches to that worktree
					-- <c-d> - deletes that worktree
					-- <c-f> - toggles forcing of the next deletion end, desc = "Create Worktree" },
				end,
				desc = "Worktree Selection"
			} }
	}
}
