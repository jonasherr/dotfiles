import type { Plugin } from "@opencode-ai/plugin";

export const SoundNotificationPlugin: Plugin = async ({ app, client, $ }) => {
	return {
		event: async ({ event }) => {
			// Play sound when session becomes idle (task completion)
			if (event.type === "session.idle") {
				try {
					await $`afplay /System/Library/Sounds/Glass.aiff`;
				} catch (error) {
					console.error("Failed to play notification sound:", error);
				}
			}
		},
	};
};

