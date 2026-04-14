import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readdirSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { createConnection } from "net";
import { homedir } from "os";
import { basename, join } from "path";

const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock";
const SIDEBAR_DAEMON_PATH = join(
  homedir(),
  ".config",
  "kitty",
  "meow",
  "sidebar_daemon.py",
);
const IDLE_DEBOUNCE_MS = 1500;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const QUESTION_TOOLS = new Set([
  "question",
  "ask_user_question",
  "askuserquestion",
]);

let daemonSpawning = false;

function isDaemonReachable(): Promise<boolean> {
  if (!existsSync(KITTY_SIDEBAR_SOCK)) return Promise.resolve(false);

  return new Promise((resolve) => {
    const socket = createConnection(KITTY_SIDEBAR_SOCK);
    socket.setTimeout(2000);
    socket.on("connect", () => {
      socket.write('{"type":"get_state"}\n');
    });
    socket.on("data", () => {
      try {
        socket.destroy();
      } catch {}
      resolve(true);
    });
    socket.on("error", () => {
      try {
        socket.destroy();
      } catch {}
      resolve(false);
    });
    socket.on("timeout", () => {
      try {
        socket.destroy();
      } catch {}
      resolve(false);
    });
  });
}

function spawnDaemon(): void {
  if (daemonSpawning) return;
  if (!existsSync(SIDEBAR_DAEMON_PATH)) return;

  daemonSpawning = true;

  const child = spawn("python3", [SIDEBAR_DAEMON_PATH], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  // Give the daemon a moment to bind the socket, then clear the flag
  setTimeout(() => {
    daemonSpawning = false;
  }, 2000);
}

async function ensureDaemon(): Promise<void> {
  if (await isDaemonReachable()) return;
  spawnDaemon();
}

function resolveKittySession(): string | undefined {
  const cwd = process.cwd();
  const home = homedir();
  const sessionsDir = join(home, ".config", "kitty", "sessions");

  try {
    const files = readdirSync(sessionsDir).filter(
      (f: string) =>
        f.endsWith(".kitty-session") && f !== "template.kitty-session",
    );
    for (const file of files) {
      const content = readFileSync(join(sessionsDir, file), "utf-8");
      const cdLine = content
        .split("\n")
        .find((l: string) => l.startsWith("cd "));
      if (!cdLine) continue;
      const sessionDir = cdLine.slice(3).trim().replace(/^~/, home);
      if (cwd === sessionDir || cwd.startsWith(sessionDir + "/")) {
        return basename(file, ".kitty-session");
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

type KittyNotificationType = "idle" | "input" | "permission";

function resolveKittyWindowId(): number | undefined {
  const raw = process.env.KITTY_WINDOW_ID;
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function notifyKitty(
  sessionName: string | undefined,
  type: KittyNotificationType,
  message: string,
  windowId?: number,
): void {
  const payload = JSON.stringify({
    type: "notify",
    session_name: sessionName ?? "",
    notification_type: type,
    message,
    ...(windowId !== undefined ? { window_id: windowId } : {}),
  });

  const attempt = () => {
    try {
      const socket = createConnection(KITTY_SIDEBAR_SOCK);
      socket.setTimeout(2000);
      socket.on("connect", () => {
        socket.write(`${payload}\n`);
        socket.end();
      });
      socket.on("error", () => {
        try {
          socket.destroy();
        } catch {}
      });
      socket.on("timeout", () => {
        try {
          socket.destroy();
        } catch {}
      });
    } catch {
      // silent — notification is best-effort
    }
  };

  if (existsSync(KITTY_SIDEBAR_SOCK)) {
    attempt();
  } else {
    // Daemon is down — respawn and retry once after it starts
    spawnDaemon();
    setTimeout(attempt, 2500);
  }
}

/**
 * Extract sessionID from any event's properties.
 * Events use different property shapes, but sessionID is always at
 * properties.sessionID or properties.info.sessionID.
 */
function getEventSessionID(event: {
  type: string;
  properties?: any;
}): string | undefined {
  const props = event.properties;
  if (!props) return undefined;
  if (typeof props.sessionID === "string") return props.sessionID;
  if (typeof props.info?.sessionID === "string") return props.info.sessionID;
  if (typeof props.info?.id === "string") return props.info.id;
  return undefined;
}

/**
 * Check if a session.status event represents an idle transition.
 * OpenCode sometimes sends session.status(idle) instead of / in addition to
 * session.idle. oh-my-opencode normalizes these internally; we do the same.
 */
function isIdleStatusEvent(event: { type: string; properties?: any }): boolean {
  if (event.type !== "session.status") return false;
  return event.properties?.status?.type === "idle";
}

export const TerminalNotifyPlugin: Plugin = async () => {
  const kittySessionName = resolveKittySession();
  const kittyWindowId = resolveKittyWindowId();

  await ensureDaemon();

  setInterval(() => {
    ensureDaemon();
  }, HEALTH_CHECK_INTERVAL_MS);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleSessionID: string | null = null;
  let mainSessionID: string | null = null;
  const notifiedPermissions = new Set<string>();

  function startIdleTimer(sessionID: string | undefined) {
    if (idleTimer) clearTimeout(idleTimer);
    idleSessionID = sessionID ?? null;

    idleTimer = setTimeout(() => {
      idleTimer = null;
      idleSessionID = null;
      notifyKitty(kittySessionName, "idle", "Agent is ready for input", kittyWindowId);
    }, IDLE_DEBOUNCE_MS);
  }

  function cancelIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
      idleSessionID = null;
    }
  }

  return {
    event: async ({ event }) => {
      const eventSessionID = getEventSessionID(event);

      if (event.type === "session.created") {
        const hasParent = !!event.properties?.info?.parentID;
        if (!hasParent && eventSessionID) {
          mainSessionID = eventSessionID;
        }
      }

      if (event.type === "permission.updated") {
        const props = event.properties as Record<string, unknown> | undefined;
        const permissionId =
          typeof props?.id === "string" ? props.id : undefined;
        if (permissionId && notifiedPermissions.has(permissionId)) return;
        if (permissionId) notifiedPermissions.add(permissionId);

        cancelIdleTimer();
        const metadata = props?.metadata as Record<string, unknown> | undefined;
        const description =
          typeof metadata?.command === "string"
            ? metadata.command
            : typeof props?.title === "string"
              ? props.title
              : "Permission required";

        notifyKitty(
          kittySessionName,
          "permission",
          String(description),
          kittyWindowId,
        );
        return;
      }

      if (event.type === "permission.replied") {
        const props = event.properties as Record<string, unknown> | undefined;
        if (typeof props?.id === "string") notifiedPermissions.delete(props.id);
        return;
      }

      if (event.type === "session.idle" || isIdleStatusEvent(event)) {
        if (mainSessionID && eventSessionID && eventSessionID !== mainSessionID)
          return;
        startIdleTimer(eventSessionID);
        return;
      }

      if (event.type === "session.status" && !isIdleStatusEvent(event)) {
        if (idleTimer && idleSessionID && eventSessionID === idleSessionID) {
          cancelIdleTimer();
        }
      }
    },

    "tool.execute.before": async (input) => {
      const toolName = input.tool?.toLowerCase();
      if (toolName && QUESTION_TOOLS.has(toolName)) {
        notifyKitty(
          kittySessionName,
          "input",
          "Agent is asking a question",
          kittyWindowId,
        );
      }
    },

    "permission.ask": async (input, output) => {
      // Only notify when human action is actually needed.
      // damage-control runs before us and auto-approves safe commands,
      // so if status is still "ask" here, it genuinely needs attention.
      if (output.status !== "ask") return;

      const inputId = (input as Record<string, unknown>).id;
      if (typeof inputId === "string" && notifiedPermissions.has(inputId))
        return;
      if (typeof inputId === "string") notifiedPermissions.add(inputId);

      cancelIdleTimer();

      const description =
        input.type === "bash" && typeof input.metadata?.command === "string"
          ? input.metadata.command
          : input.title || input.type;

      notifyKitty(
        kittySessionName,
        "permission",
        String(description),
        kittyWindowId,
      );
    },
  };
};
