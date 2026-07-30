import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Form,
  Icon,
  List,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { createConnection } from "net";
import { homedir } from "os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "path";
import { useEffect, useMemo, useRef, useState } from "react";

interface Preferences {
  customersDirectory?: string;
  customerAdminUrlTemplate?: string;
}

const preferences = getPreferenceValues<Preferences>();
const SESSIONS_DIR = join(homedir(), ".config", "kitty", "sessions");
const PROJECTS_DIR = join(homedir(), "Projects");
const CUSTOMERS_DIR = preferences.customersDirectory
  ? resolve(preferences.customersDirectory.replace(/^~(?=\/|$)/, homedir()))
  : "";
const CUSTOMERS_SESSION_PATH = join(SESSIONS_DIR, "customers.kitty-session");
const KITTEN = "/Applications/kitty.app/Contents/MacOS/kitten";
const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock";
const HOME = homedir();
const RESERVED_SESSION_FILES = new Set([
  "startup.kitty-session",
  "template.kitty-session",
]);
const PINNED_SESSION_NAMES = new Set([
  "agent-help",
  "customers",
  "dotfiles",
  "jonas-herrmannsdoerfer.de",
  "notes",
  "vercel-internal-agents",
  "writing",
]);

interface Session {
  name: string;
  path: string;
  content: string;
}

interface ProjectDir {
  name: string;
  path: string;
  relativePath: string;
}

interface Customer {
  name: string;
  path: string;
  teamId?: string;
}

interface SidebarNotification {
  session_name: string;
  type: string;
  message: string;
  timestamp: number;
  read?: boolean;
  window_id?: number | null;
}

interface NotificationsStateResponse {
  notifications?: Record<string, SidebarNotification[]>;
  active_windows?: Record<string, number>;
}

interface ClearNotificationsResponse {
  status?: string;
}

function requestNotificationDaemon<T>(payload: object): Promise<T | null> {
  return new Promise((resolveRequest) => {
    let socket: ReturnType<typeof createConnection> | null = null;
    let settled = false;
    let buffer = "";

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {
        // The socket may already be destroyed.
      }
      resolveRequest(value);
    };

    const parseBuffer = () => {
      const newlineIndex = buffer.indexOf("\n");
      const message =
        newlineIndex >= 0
          ? buffer.slice(0, newlineIndex).trim()
          : buffer.trim();
      if (!message) {
        finish(null);
        return;
      }
      try {
        finish(JSON.parse(message) as T);
      } catch {
        finish(null);
      }
    };

    try {
      socket = createConnection(KITTY_SIDEBAR_SOCK);
      socket.setTimeout(2000);
      socket.on("connect", () => {
        socket?.end(`${JSON.stringify(payload)}\n`);
      });
      socket.on("data", (chunk: { toString(): string }) => {
        buffer += chunk.toString();
        if (buffer.includes("\n")) parseBuffer();
      });
      socket.on("end", () => {
        if (!settled) parseBuffer();
      });
      socket.on("error", () => finish(null));
      socket.on("timeout", () => finish(null));
    } catch {
      finish(null);
    }
  });
}

async function getNotifications(): Promise<Record<string, number>> {
  const response = await requestNotificationDaemon<NotificationsStateResponse>({
    type: "get_state",
  });
  if (!response?.notifications) return {};

  return Object.fromEntries(
    Object.entries(response.notifications)
      .map(
        ([sessionName, items]) =>
          [
            sessionName,
            items.filter((item) => item.read !== true).length,
          ] as const,
      )
      .filter(([, count]) => count > 0),
  );
}

async function getWindowToFocus(
  sessionName: string,
): Promise<number | undefined> {
  const response = await requestNotificationDaemon<NotificationsStateResponse>({
    type: "get_state",
  });
  if (!response) return undefined;

  const notifications = response.notifications?.[sessionName] ?? [];
  const latestWithWindow = [...notifications]
    .filter((notification) => notification.read !== true)
    .reverse()
    .find((notification) => typeof notification.window_id === "number");
  if (latestWithWindow?.window_id != null) return latestWithWindow.window_id;

  const activeWindow = response.active_windows?.[sessionName];
  return typeof activeWindow === "number" ? activeWindow : undefined;
}

async function clearNotifications(sessionName: string): Promise<void> {
  await requestNotificationDaemon<ClearNotificationsResponse>({
    type: "clear",
    session_name: sessionName,
  });
}

let cachedKittySocket: { path: string | null; expiresAt: number } | null = null;

function getKittySocket(): string | null {
  const now = Date.now();
  if (cachedKittySocket && cachedKittySocket.expiresAt > now) {
    return cachedKittySocket.path;
  }

  try {
    const sockets = readdirSync("/tmp")
      .filter((file) => file.startsWith("mykitty-"))
      .sort()
      .map((file) => join("/tmp", file));
    let firstLiveSocket: string | null = null;

    for (const socket of sockets) {
      try {
        const output = execFileSync(
          KITTEN,
          ["@", "--to", `unix:${socket}`, "ls"],
          { encoding: "utf-8", timeout: 1000 },
        );
        const osWindows = JSON.parse(output) as Array<{ is_focused?: boolean }>;
        firstLiveSocket ??= socket;
        if (osWindows.some((osWindow) => osWindow.is_focused)) {
          cachedKittySocket = { path: socket, expiresAt: now + 1000 };
          return socket;
        }
      } catch {
        continue;
      }
    }

    cachedKittySocket = { path: firstLiveSocket, expiresAt: now + 1000 };
    return firstLiveSocket;
  } catch {
    cachedKittySocket = { path: null, expiresAt: now + 1000 };
    return null;
  }
}

function runKittyRemote(args: string[], timeout = 3000): string {
  const socket = getKittySocket();
  if (!socket) throw new Error("Kitty is not running");
  return execFileSync(KITTEN, ["@", "--to", `unix:${socket}`, ...args], {
    encoding: "utf-8",
    timeout,
  });
}

function escapeKittyRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sessionMatch(sessionName: string): string {
  return `session:^${escapeKittyRegex(sessionName)}$`;
}

function isSessionLoaded(sessionName: string): boolean {
  try {
    const output = runKittyRemote(["ls", "--match", sessionMatch(sessionName)]);
    const osWindows = JSON.parse(output) as Array<{ tabs?: unknown[] }>;
    return osWindows.some((osWindow) => (osWindow.tabs?.length ?? 0) > 0);
  } catch {
    return false;
  }
}

function getActiveSessionNames(sessions: Session[]): Set<string> {
  if (!getKittySocket()) return new Set();
  return new Set(
    sessions
      .filter((session) => isSessionLoaded(session.name))
      .map((session) => session.name),
  );
}

function closeLoadedSession(sessionName: string): void {
  runKittyRemote([
    "close-tab",
    "--match",
    sessionMatch(sessionName),
    "--ignore-no-match",
  ]);
}

function getSessionFiles(): Session[] {
  try {
    return readdirSync(SESSIONS_DIR)
      .filter(
        (file) =>
          file.endsWith(".kitty-session") && !RESERVED_SESSION_FILES.has(file),
      )
      .map((file) => {
        const fullPath = join(SESSIONS_DIR, file);
        return {
          name: basename(file, ".kitty-session"),
          path: fullPath,
          content: readFileSync(fullPath, "utf-8").trim(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function resolveSessionPath(value: string, sessionPath: string): string {
  const expanded = value === "~" ? HOME : value.replace(/^~\//, `${HOME}/`);
  return normalize(
    isAbsolute(expanded) ? expanded : resolve(dirname(sessionPath), expanded),
  );
}

function getSessionProjectPath(session: Session): string | null {
  const cdLine = session.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("cd "));
  if (!cdLine) return null;

  const rawPath = cdLine.slice(3).trim();
  if (!rawPath || rawPath.includes("{directory}")) return null;
  return resolveSessionPath(rawPath, session.path);
}

function getSessionProjectPaths(sessions: Session[]): Set<string> {
  return new Set(
    sessions
      .map(getSessionProjectPath)
      .filter((path): path is string => path !== null),
  );
}

function parseCustomerMetadata(customerPath: string): {
  name?: string;
  teamId?: string;
  classification?: string;
} {
  const metadataPath = join(customerPath, "customer.md");
  if (!existsSync(metadataPath)) return {};

  try {
    const content = readFileSync(metadataPath, "utf-8");
    const frontmatter = content.match(
      /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/,
    )?.[1];
    if (!frontmatter) return {};

    const values = new Map<string, string>();
    for (const line of frontmatter.split("\n")) {
      const match = line.match(/^([a-zA-Z_][\w-]*):\s*(.*?)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
      values.set(match[1], value);
    }

    const teamId = values.get("team_id");
    return {
      name: values.get("name") || undefined,
      teamId: teamId?.match(/^team_[a-zA-Z0-9]+$/)?.[0],
      classification: values.get("classification") || undefined,
    };
  } catch {
    return {};
  }
}

function getCustomers(): Customer[] {
  if (!CUSTOMERS_DIR) return [];
  try {
    return readdirSync(CUSTOMERS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => {
        const customerPath = join(CUSTOMERS_DIR, entry.name);
        return {
          entry,
          customerPath,
          metadata: parseCustomerMetadata(customerPath),
        };
      })
      .filter(({ metadata }) => metadata.classification !== "collection")
      .map(({ entry, customerPath, metadata }) => ({
        name: metadata.name ?? entry.name,
        path: customerPath,
        teamId: metadata.teamId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function isGitRoot(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}

function collectGitRoots(
  dirPath: string,
  sessionPaths: Set<string>,
  results: ProjectDir[],
  rootDir: string,
): void {
  if (!existsSync(dirPath)) return;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        entry.name === "node_modules"
      ) {
        continue;
      }

      const fullPath = join(dirPath, entry.name);
      if (isGitRoot(fullPath)) {
        if (!sessionPaths.has(normalize(fullPath))) {
          results.push({
            name: entry.name,
            path: fullPath,
            relativePath: `~/Projects/${relative(rootDir, fullPath)}`,
          });
        }
      } else {
        collectGitRoots(fullPath, sessionPaths, results, rootDir);
      }
    }
  } catch {
    return;
  }
}

function getProjectDirs(sessionPaths: Set<string>): ProjectDir[] {
  const results: ProjectDir[] = [];
  collectGitRoots(PROJECTS_DIR, sessionPaths, results, PROJECTS_DIR);
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function sanitizeSessionName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getSessionPathForProject(
  dirPath: string,
  sessions: Session[],
): string {
  const projectPath = normalize(dirPath);
  const existingSession = sessions.find(
    (session) => getSessionProjectPath(session) === projectPath,
  );
  if (existingSession) return existingSession.path;

  const baseName = sanitizeSessionName(basename(projectPath)) || "project";
  const preferredPath = join(SESSIONS_DIR, `${baseName}.kitty-session`);
  if (!existsSync(preferredPath)) return preferredPath;

  const hash = createHash("sha256").update(projectPath).digest("hex");
  for (let length = 8; length <= hash.length; length += 4) {
    const candidate = join(
      SESSIONS_DIR,
      `${baseName}-${hash.slice(0, length)}.kitty-session`,
    );
    if (!existsSync(candidate)) return candidate;
  }

  throw new Error("Could not allocate a unique session filename");
}

function createSessionFromTemplate(
  dirPath: string,
  sessions: Session[],
): string {
  const sessionPath = getSessionPathForProject(dirPath, sessions);
  if (existsSync(sessionPath)) return sessionPath;

  const templatePath = join(SESSIONS_DIR, "template.kitty-session");
  const template = existsSync(templatePath)
    ? readFileSync(templatePath, "utf-8").replaceAll("{directory}", dirPath)
    : `layout horizontal\ncd ${dirPath}\nlaunch pi\nlaunch\n`;
  writeFileSync(sessionPath, template, { flag: "wx" });
  return sessionPath;
}

function openCustomer(customer: Customer): void {
  try {
    runKittyRemote(["action", "goto_session", CUSTOMERS_SESSION_PATH]);
    runKittyRemote([
      "launch",
      "--type=tab",
      "--match",
      sessionMatch("customers"),
      "--add-to-session=customers",
      "--cwd",
      customer.path,
      "--tab-title",
      customer.name,
    ]);
    execFileSync("osascript", ["-e", 'tell application "kitty" to activate']);
    closeMainWindow();
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to open customer",
      message: String(error),
    });
  }
}

function switchToSession(
  sessionPath: string,
  onSuccess?: () => void,
  windowId?: number,
): boolean {
  try {
    runKittyRemote(["action", "goto_session", sessionPath]);
    if (windowId !== undefined) {
      try {
        runKittyRemote(["focus-window", "--match", `id:${windowId}`]);
      } catch {
        // The remembered window may no longer exist.
      }
    }
    execFileSync("osascript", ["-e", 'tell application "kitty" to activate']);
    closeMainWindow();
    showToast({
      style: Toast.Style.Success,
      title: "Switched session",
      message: basename(sessionPath, ".kitty-session"),
    });
    onSuccess?.();
    return true;
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to switch",
      message: String(error),
    });
    return false;
  }
}

async function renameSession(
  session: Session,
  newName: string,
): Promise<boolean> {
  const nextName = sanitizeSessionName(newName);
  if (!nextName) {
    showToast({ style: Toast.Style.Failure, title: "Name required" });
    return false;
  }
  if (RESERVED_SESSION_FILES.has(`${nextName}.kitty-session`)) {
    showToast({ style: Toast.Style.Failure, title: "Reserved session name" });
    return false;
  }
  if (nextName === session.name) return true;

  const nextPath = join(SESSIONS_DIR, `${nextName}.kitty-session`);
  if (existsSync(nextPath)) {
    showToast({ style: Toast.Style.Failure, title: "Session already exists" });
    return false;
  }

  const wasLoaded = isSessionLoaded(session.name);
  if (
    wasLoaded &&
    !(await confirmAlert({
      title: `Rename running session "${session.name}"?`,
      message:
        "This closes its current tabs and reloads them from the session file. Unsaved terminal state will be lost.",
      primaryAction: {
        title: "Rename and Reload",
        style: Alert.ActionStyle.Destructive,
      },
    }))
  ) {
    return false;
  }

  try {
    renameSync(session.path, nextPath);
    if (wasLoaded) {
      try {
        closeLoadedSession(session.name);
        runKittyRemote(["action", "goto_session", nextPath]);
      } catch (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Renamed, but could not reload session",
          message: String(error),
        });
        return false;
      }
    }
    await clearNotifications(session.name);
    showToast({
      style: Toast.Style.Success,
      title: "Renamed session",
      message: `${session.name} → ${nextName}`,
    });
    return true;
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to rename",
      message: String(error),
    });
    return false;
  }
}

async function deleteSession(
  session: Session,
  wasActive: boolean,
): Promise<boolean> {
  try {
    if (wasActive || isSessionLoaded(session.name)) {
      closeLoadedSession(session.name);
    }
    unlinkSync(session.path);
    await clearNotifications(session.name);
    showToast({
      style: Toast.Style.Success,
      title: "Deleted session",
      message: session.name,
    });
    return true;
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to delete",
      message: String(error),
    });
    return false;
  }
}

interface SessionsData {
  sessions: Session[];
  customers: Customer[];
  activeSessionNames: string[];
  notifications: Record<string, number>;
}

async function fetchSessionsData(): Promise<SessionsData> {
  const sessions = getSessionFiles();
  const customers = getCustomers();
  const activeSessionNames = [...getActiveSessionNames(sessions)];
  const notifications = await getNotifications();
  return { sessions, customers, activeSessionNames, notifications };
}

function SessionsList({
  sessions,
  revalidate,
  activeSessionNames,
  notifications,
  showActiveIndicator,
}: {
  sessions: Session[];
  revalidate: () => void;
  activeSessionNames: Set<string>;
  notifications: Record<string, number>;
  showActiveIndicator: boolean;
}) {
  const { push } = useNavigation();
  return (
    <>
      {sessions.length === 0 ? (
        <List.EmptyView
          title="No Sessions"
          description="Use the Projects view to create one"
          icon={Icon.Terminal}
        />
      ) : (
        sessions.map((session) => {
          const active = activeSessionNames.has(session.name);
          const pinned = PINNED_SESSION_NAMES.has(session.name);
          const notificationCount = notifications[session.name] ?? 0;
          const accessories: List.Item.Accessory[] = [];

          if (notificationCount > 0) {
            accessories.push({
              icon: { source: Icon.Bell, tintColor: Color.Red },
              text: String(notificationCount),
              tooltip: `${notificationCount} notification${notificationCount === 1 ? "" : "s"}`,
            });
          }
          if (showActiveIndicator && active) {
            accessories.push({
              icon: { source: Icon.CircleFilled, tintColor: Color.Green },
              tooltip: "Running",
            });
          }

          return (
            <List.Item
              key={session.name}
              title={session.name}
              subtitle={
                session.content
                  .split("\n")
                  .find((line) => line.trim().startsWith("cd "))
                  ?.trim()
                  .slice(3) ?? ""
              }
              icon={Icon.Terminal}
              accessories={accessories}
              actions={
                <ActionPanel>
                  <Action
                    title="Switch to Session"
                    icon={Icon.ArrowRight}
                    onAction={async () => {
                      const windowId = await getWindowToFocus(session.name);
                      const switched = switchToSession(
                        session.path,
                        undefined,
                        windowId,
                      );
                      if (switched && notificationCount > 0) {
                        await clearNotifications(session.name);
                      }
                    }}
                  />
                  <Action.ShowInFinder
                    title="Show Session File"
                    path={session.path}
                  />
                  <Action.CopyToClipboard
                    title="Copy Session Path"
                    content={session.path}
                  />
                  {notificationCount > 0 ? (
                    <Action
                      title="Clear Notifications"
                      icon={Icon.Bell}
                      shortcut={{ modifiers: ["ctrl"], key: "n" }}
                      onAction={async () => {
                        await clearNotifications(session.name);
                        revalidate();
                      }}
                    />
                  ) : null}
                  {!pinned ? (
                    <Action
                      title="Rename Session"
                      icon={Icon.Pencil}
                      shortcut={{ modifiers: ["ctrl"], key: "r" }}
                      onAction={() =>
                        push(
                          <RenameSessionForm
                            session={session}
                            revalidate={revalidate}
                          />,
                        )
                      }
                    />
                  ) : null}
                  {!pinned ? (
                    <Action
                      title="Delete Session"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={async () => {
                        const confirmed = await confirmAlert({
                          title: `Delete "${session.name}"?`,
                          message: active
                            ? "This will close the running session and remove its file."
                            : `This will remove ${basename(session.path)}.`,
                          primaryAction: {
                            title: "Delete",
                            style: Alert.ActionStyle.Destructive,
                          },
                        });
                        if (
                          confirmed &&
                          (await deleteSession(session, active))
                        ) {
                          revalidate();
                        }
                      }}
                    />
                  ) : null}
                </ActionPanel>
              }
            />
          );
        })
      )}
    </>
  );
}

function RenameSessionForm({
  session,
  revalidate,
}: {
  session: Session;
  revalidate: () => void;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`Rename ${session.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename"
            onSubmit={async (values: { name: string }) => {
              if (await renameSession(session, values.name)) {
                revalidate();
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" defaultValue={session.name} />
    </Form>
  );
}

function CustomersList({ customers }: { customers: Customer[] }) {
  return (
    <>
      {customers.length === 0 ? (
        <List.EmptyView
          title="No Customers Found"
          description={`Add customer folders to ${CUSTOMERS_DIR}`}
          icon={Icon.Person}
        />
      ) : (
        customers.map((customer) => (
          <List.Item
            key={customer.path}
            title={customer.name}
            icon={Icon.Person}
            actions={
              <ActionPanel>
                <Action
                  title="Open in Customer Session"
                  icon={Icon.Terminal}
                  onAction={() => openCustomer(customer)}
                />
                {customer.teamId && preferences.customerAdminUrlTemplate ? (
                  <Action.OpenInBrowser
                    title="Open Customer Admin"
                    icon={Icon.Globe}
                    url={preferences.customerAdminUrlTemplate.replace(
                      "{team_id}",
                      customer.teamId,
                    )}
                  />
                ) : null}
                <Action.ShowInFinder
                  title="Show Customer Folder"
                  path={customer.path}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </>
  );
}

function ProjectsList({
  sessions,
  revalidate,
}: {
  sessions: Session[];
  revalidate: () => void;
}) {
  const sessionPaths = useMemo(
    () => getSessionProjectPaths(sessions),
    [sessions],
  );
  const projects = useMemo(() => getProjectDirs(sessionPaths), [sessionPaths]);

  return (
    <>
      {projects.length === 0 ? (
        <List.EmptyView
          title="No Projects Found"
          description="All git repositories already have sessions"
          icon={Icon.Folder}
        />
      ) : (
        projects.map((project) => (
          <List.Item
            key={project.path}
            title={project.name}
            subtitle={dirname(project.relativePath)}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action
                  title="Create Session and Switch"
                  icon={Icon.Plus}
                  onAction={() => {
                    try {
                      const sessionPath = createSessionFromTemplate(
                        project.path,
                        sessions,
                      );
                      switchToSession(sessionPath, revalidate);
                    } catch (error) {
                      showToast({
                        style: Toast.Style.Failure,
                        title: "Failed to create session",
                        message: String(error),
                      });
                    }
                  }}
                />
                <Action.ShowInFinder
                  title="Show in Finder"
                  path={project.path}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </>
  );
}

const POLL_INTERVAL = 1000;

export default function Command() {
  const { data, isLoading, revalidate } = useCachedPromise(fetchSessionsData);
  const [tab, setTab] = useState("active");
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;

  useEffect(() => {
    const id = setInterval(() => revalidateRef.current(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const sessions = data?.sessions ?? [];
  const customers = data?.customers ?? [];
  const activeSessionNames = useMemo(
    () => new Set(data?.activeSessionNames ?? []),
    [data?.activeSessionNames],
  );
  const notifications = data?.notifications ?? {};

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const notificationDiff =
          (notifications[b.name] ?? 0) - (notifications[a.name] ?? 0);
        if (notificationDiff !== 0) return notificationDiff;

        const activeDiff =
          Number(activeSessionNames.has(b.name)) -
          Number(activeSessionNames.has(a.name));
        return activeDiff || a.name.localeCompare(b.name);
      }),
    [sessions, notifications, activeSessionNames],
  );

  const activeSessions = useMemo(
    () =>
      sortedSessions.filter((session) => activeSessionNames.has(session.name)),
    [sortedSessions, activeSessionNames],
  );

  const placeholders: Record<string, string> = {
    active: "Search active sessions...",
    all: "Search sessions...",
    projects: "Search projects...",
    customers: "Search customers...",
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={placeholders[tab] ?? "Search..."}
      searchBarAccessory={
        <List.Dropdown tooltip="View" onChange={setTab} value={tab}>
          <List.Dropdown.Item
            title="Active"
            value="active"
            icon={Icon.Circle}
          />
          <List.Dropdown.Item
            title="All Sessions"
            value="all"
            icon={Icon.Terminal}
          />
          <List.Dropdown.Item
            title="Projects"
            value="projects"
            icon={Icon.Folder}
          />
          <List.Dropdown.Item
            title="Customers"
            value="customers"
            icon={Icon.Person}
          />
        </List.Dropdown>
      }
    >
      {tab === "active" ? (
        <SessionsList
          sessions={activeSessions}
          revalidate={revalidate}
          activeSessionNames={activeSessionNames}
          notifications={notifications}
          showActiveIndicator={false}
        />
      ) : tab === "all" ? (
        <SessionsList
          sessions={sortedSessions}
          revalidate={revalidate}
          activeSessionNames={activeSessionNames}
          notifications={notifications}
          showActiveIndicator
        />
      ) : tab === "projects" ? (
        <ProjectsList sessions={sessions} revalidate={revalidate} />
      ) : (
        <CustomersList customers={customers} />
      )}
    </List>
  );
}
