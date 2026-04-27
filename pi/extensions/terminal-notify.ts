import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { spawn } from "node:child_process"

const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock"
const SIDEBAR_DAEMON_PATH = join(homedir(), ".config", "kitty", "meow", "sidebar_daemon.py")
const IDLE_DEBOUNCE_MS = 1500
const HEALTH_CHECK_INTERVAL_MS = 30_000
const QUESTION_TOOLS = new Set(["question", "ask_user_question", "askuserquestion"])

let daemonSpawning = false

function isDaemonReachable(): Promise<boolean> {
  if (!existsSync(KITTY_SIDEBAR_SOCK)) return Promise.resolve(false)

  return new Promise((resolve) => {
    const socket = createConnection(KITTY_SIDEBAR_SOCK)
    socket.setTimeout(2000)
    socket.on("connect", () => {
      socket.write('{"type":"get_state"}\n')
    })
    socket.on("data", () => {
      try {
        socket.destroy()
      } catch {}
      resolve(true)
    })
    socket.on("error", () => {
      try {
        socket.destroy()
      } catch {}
      resolve(false)
    })
    socket.on("timeout", () => {
      try {
        socket.destroy()
      } catch {}
      resolve(false)
    })
  })
}

function spawnDaemon(): void {
  if (daemonSpawning) return
  if (!existsSync(SIDEBAR_DAEMON_PATH)) return

  daemonSpawning = true

  const child = spawn("python3", [SIDEBAR_DAEMON_PATH], {
    stdio: "ignore",
    detached: true,
  })
  child.unref()

  setTimeout(() => {
    daemonSpawning = false
  }, 2000).unref?.()
}

async function ensureDaemon(): Promise<void> {
  if (await isDaemonReachable()) return
  spawnDaemon()
}

function resolveKittySession(): string | undefined {
  const cwd = process.cwd()
  const home = homedir()
  const sessionsDir = join(home, ".config", "kitty", "sessions")

  try {
    const files = readdirSync(sessionsDir).filter(
      (file: string) => file.endsWith(".kitty-session") && file !== "template.kitty-session",
    )
    for (const file of files) {
      const content = readFileSync(join(sessionsDir, file), "utf-8")
      const cdLine = content.split("\n").find((line: string) => line.startsWith("cd "))
      if (!cdLine) continue
      const sessionDir = cdLine.slice(3).trim().replace(/^~/, home)
      if (cwd === sessionDir || cwd.startsWith(sessionDir + "/")) {
        return basename(file, ".kitty-session")
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

type KittyNotificationType = "idle" | "input" | "permission"

type NotificationCopy = {
  title: string
  subtitle: string
  message: string
}

function notificationCopy(type: KittyNotificationType, message: string): NotificationCopy {
  const session = kittySessionName ? ` (${kittySessionName})` : ""

  if (type === "idle") {
    return {
      title: "Pi",
      subtitle: `Ready for input${session}`,
      message,
    }
  }

  if (type === "input") {
    return {
      title: "Pi needs input",
      subtitle: `Question${session}`,
      message,
    }
  }

  return {
    title: "Pi needs permission",
    subtitle: `Approval required${session}`,
    message,
  }
}

function runDetached(command: string, args: string[], onError?: () => void): void {
  try {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    })
    child.on("error", () => onError?.())
    child.unref()
  } catch {
    onError?.()
  }
}

function notifyDesktop(type: KittyNotificationType, message: string): void {
  const copy = notificationCopy(type, message)

  // Prefer terminal-notifier when available because it creates proper macOS
  // notifications from a real app bundle. Fall back to AppleScript otherwise.
  runDetached(
    "terminal-notifier",
    ["-title", copy.title, "-subtitle", copy.subtitle, "-message", copy.message, "-group", `pi-${type}`],
    () => {
      runDetached("osascript", [
        "-e",
        `display notification ${JSON.stringify(copy.message)} with title ${JSON.stringify(copy.title)} subtitle ${JSON.stringify(copy.subtitle)}`,
      ])
    },
  )
}

function resolveKittyWindowId(): number | undefined {
  const raw = process.env.KITTY_WINDOW_ID
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function notifyKitty(
  sessionName: string | undefined,
  type: KittyNotificationType,
  message: string,
  windowId?: number,
): void {
  notifyDesktop(type, message)

  const payload = JSON.stringify({
    type: "notify",
    session_name: sessionName ?? "",
    notification_type: type,
    message,
    ...(windowId !== undefined ? { window_id: windowId } : {}),
  })

  const attempt = () => {
    try {
      const socket = createConnection(KITTY_SIDEBAR_SOCK)
      socket.setTimeout(2000)
      socket.on("connect", () => {
        socket.write(`${payload}\n`)
        socket.end()
      })
      socket.on("error", () => {
        try {
          socket.destroy()
        } catch {}
      })
      socket.on("timeout", () => {
        try {
          socket.destroy()
        } catch {}
      })
    } catch {
      // Best-effort notification only.
    }
  }

  if (existsSync(KITTY_SIDEBAR_SOCK)) {
    attempt()
  } else {
    spawnDaemon()
    setTimeout(attempt, 2500).unref?.()
  }
}

const kittySessionName = resolveKittySession()
const kittyWindowId = resolveKittyWindowId()

export function notifyTerminalPermission(message: string): void {
  notifyKitty(kittySessionName, "permission", message, kittyWindowId)
}

export function notifyTerminalInput(message = "Agent is asking a question"): void {
  notifyKitty(kittySessionName, "input", message, kittyWindowId)
}

export function notifyTerminalIdle(message = "Agent is ready for input"): void {
  notifyKitty(kittySessionName, "idle", message, kittyWindowId)
}

export default async function (pi: ExtensionAPI) {
  await ensureDaemon()

  const healthCheck = setInterval(() => {
    ensureDaemon()
  }, HEALTH_CHECK_INTERVAL_MS)
  healthCheck.unref?.()

  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function startIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)

    idleTimer = setTimeout(() => {
      idleTimer = null
      notifyTerminalIdle()
    }, IDLE_DEBOUNCE_MS)
  }

  function cancelIdleTimer() {
    if (!idleTimer) return
    clearTimeout(idleTimer)
    idleTimer = null
  }

  pi.on("before_agent_start", () => {
    cancelIdleTimer()
  })

  pi.on("tool_call", (event) => {
    cancelIdleTimer()

    const toolName = event.toolName.toLowerCase()
    if (QUESTION_TOOLS.has(toolName)) {
      notifyTerminalInput()
    }
  })

  pi.on("agent_end", () => {
    startIdleTimer()
  })

  pi.on("session_shutdown", () => {
    cancelIdleTimer()
    clearInterval(healthCheck)
  })
}
