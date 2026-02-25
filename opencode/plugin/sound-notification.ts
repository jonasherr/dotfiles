import type { Plugin } from "@opencode-ai/plugin";

export const SoundNotificationPlugin: Plugin = async ({ $ }) => {
	return {
		event: async ({ event }) => {
			const kittyWindowId = process.env.KITTY_WINDOW_ID;
			if (!kittyWindowId) return;

			// Change kitty tab color to green when session becomes idle
			if (event.type === "session.idle") {
				try {
					await $`kitty @ set-tab-color --match window_id:${kittyWindowId} active_bg=#a7c080 inactive_bg=#a7c080`;
				} catch {
					// Silent failure for kitty commands
				}
			}
		},
	};
};