return {
	"navarasu/onedark.nvim",
	priority = 1000,
	config = function()
		vim.cmd.colorscheme 'onedark'
	end,
	opts = {
		style = "ool",
		toggle_style_key = "<leader>ts"
	}
}
