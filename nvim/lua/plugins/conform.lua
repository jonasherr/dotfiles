return {
	{ -- Autoformat
		'stevearc/conform.nvim',
		opts = {
			notify_on_error = false,
			format_on_save = {
				timeout_ms = 500,
				lsp_fallback = true,
			},
			formatters_by_ft = {
				lua = { 'stylua' },
				typescriptreact = { { "prettierd", "prettier" } },
				typescript = { { "prettierd", "prettier" } },
				javascript = { { "prettierd", "prettier" } },
				javascriptreact = { { "prettierd", "prettier" } },
			},
		},
	},
}
