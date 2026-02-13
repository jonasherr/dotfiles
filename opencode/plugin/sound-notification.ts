import type { Plugin } from "@opencode-ai/plugin";

export const SoundNotificationPlugin: Plugin = async ({ app, client, $ }) => {
	return {
		event: async ({ event }) => {
			const kittyWindowId = process.env.KITTY_WINDOW_ID;

			// Play sound and show notification when session becomes idle (task completion)
			if (event.type === "session.idle") {
				try {
					await Promise.all([
						$`afplay /System/Library/Sounds/Glass.aiff`,
						$`terminal-notifier -title "opencode" -message "Session completed!"`,
					]);

					// Change kitty tab color to green when idle
					if (kittyWindowId) {
						try {
							await $`kitty @ set-tab-color --match window_id:${kittyWindowId} active_bg=#a7c080 inactive_bg=#a7c080`;
						} catch (error) {
							// Silent failure for kitty commands
						}
					}
				} catch (error) {
					console.error("Failed to play sound/notification:", error);
				}
			}
		},
	};
};

