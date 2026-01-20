import type { Plugin } from "@opencode-ai/plugin";

export const SoundNotificationPlugin: Plugin = async ({ app, client, $ }) => {
	return {
		event: async ({ event }) => {
			// Play sound and show notification when session becomes idle (task completion)
			if (event.type === "session.idle") {
				try {
					await Promise.all([
						$`afplay /System/Library/Sounds/Glass.aiff`,
						$`terminal-notifier -title "opencode" -message "Session completed!"`,
					]);
				} catch (error) {
					console.error("Failed to play sound/notification:", error);
				}
			}
		},
	};
};

