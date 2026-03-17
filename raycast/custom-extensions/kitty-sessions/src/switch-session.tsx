import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Form,
  Icon,
  List,
  confirmAlert,
  showToast,
  Toast,
  closeMainWindow,
  useNavigation,
} from "@raycast/api";
import { execSync } from "child_process";
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
import { join, basename } from "path";
import {
  useState,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

const SESSIONS_DIR = join(homedir(), ".config", "kitty", "sessions");
const PROJECTS_DIR = join(homedir(), "Projects");
const KITTEN = "/Applications/kitty.app/Contents/MacOS/kitten";
const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock";
const HOME = homedir();

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

interface SidebarNotification {
  session_name: string;
  type: string;
  message: string;
  timestamp: number;
  read?: boolean;
}

interface NotificationsStateResponse {
  notifications?: Record<string, SidebarNotification[]>;
}

interface ClearNotificationsResponse {
  status?: string;
}

function requestNotificationDaemon<T>(payload: object): Promise<T | null> {
  return new Promise((resolve) => {
    let socket: ReturnType<typeof createConnection> | null = null;
    let settled = false;
    let buffer = "";

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {
        // socket may already be destroyed — ignore
      }
      resolve(value);
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
        if (buffer.includes("\n")) {
          parseBuffer();
        }
      });
      socket.on("end", () => {
        if (!settled) {
          parseBuffer();
        }
      });
      socket.on("error", () => {
        finish(null);
      });
      socket.on("timeout", () => {
        finish(null);
      });
    } catch {
      resolve(null);
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

async function clearNotifications(sessionName: string): Promise<void> {
  await requestNotificationDaemon<ClearNotificationsResponse>({
    type: "clear",
    session_name: sessionName,
  });
}

function getKittySocket(): string | null {
  try {
    const files = readdirSync("/tmp").filter((f: string) =>
      f.startsWith("mykitty-"),
    );
    return files.length > 0 ? join("/tmp", files[0]) : null;
  } catch {
    return null;
  }
}

function resolvePath(p: string): string {
  return p.replace(/^~/, HOME);
}

function getSessionCwd(session: Session): string | null {
  const cdLine = session.content.split("\n").find((l) => l.startsWith("cd "));
  if (!cdLine) return null;
  return resolvePath(cdLine.replace("cd ", "").trim());
}

function getActiveCwds(): Set<string> {
  const socket = getKittySocket();
  if (!socket) return new Set();
  try {
    const output = execSync(`"${KITTEN}" @ --to "unix:${socket}" ls`, {
      encoding: "utf-8",
      timeout: 3000,
    });
    const data = JSON.parse(output) as Array<{
      tabs: Array<{ windows: Array<{ cwd: string }> }>;
    }>;
    const cwds = new Set<string>();
    for (const osWin of data) {
      for (const tab of osWin.tabs) {
        for (const win of tab.windows) {
          cwds.add(win.cwd);
        }
      }
    }
    return cwds;
  } catch {
    return new Set();
  }
}

function isSessionActive(session: Session, activeCwds: Set<string>): boolean {
  const sessionCwd = getSessionCwd(session);
  if (!sessionCwd) return false;
  for (const cwd of activeCwds) {
    if (cwd === sessionCwd || cwd.startsWith(sessionCwd + "/")) {
      return true;
    }
  }
  return false;
}

function getSessionFiles(): Session[] {
  try {
    return readdirSync(SESSIONS_DIR)
      .filter(
        (f: string) =>
          f.endsWith(".kitty-session") && f !== "template.kitty-session",
      )
      .map((f: string) => {
        const fullPath = join(SESSIONS_DIR, f);
        return {
          name: basename(f, ".kitty-session"),
          path: fullPath,
          content: readFileSync(fullPath, "utf-8").trim(),
        };
      })
      .sort((a: Session, b: Session) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function hasSession(dirPath: string, sessionNames: Set<string>): boolean {
  return sessionNames.has(basename(dirPath));
}

function isGitRoot(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}

function collectGitRoots(
  dirPath: string,
  sessionNames: Set<string>,
  results: ProjectDir[],
  rootDir: string,
): void {
  if (!existsSync(dirPath)) return;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        entry.name === "node_modules"
      )
        continue;
      const fullPath = join(dirPath, entry.name);
      if (isGitRoot(fullPath)) {
        if (!hasSession(fullPath, sessionNames)) {
          results.push({
            name: entry.name,
            path: fullPath,
            relativePath: fullPath.replace(rootDir + "/", "~/Projects/"),
          });
        }
      } else {
        collectGitRoots(fullPath, sessionNames, results, rootDir);
      }
    }
  } catch {
    return;
  }
}

function getProjectDirs(sessionNames: Set<string>): ProjectDir[] {
  const results: ProjectDir[] = [];
  collectGitRoots(PROJECTS_DIR, sessionNames, results, PROJECTS_DIR);
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function createSessionFromTemplate(dirPath: string): string {
  const templatePath = join(SESSIONS_DIR, "template.kitty-session");
  const sessionName = basename(dirPath);
  const sessionPath = join(SESSIONS_DIR, `${sessionName}.kitty-session`);
  const template = existsSync(templatePath)
    ? readFileSync(templatePath, "utf-8").replace("{directory}", dirPath)
    : `layout horizontal\ncd ${dirPath}\nlaunch opencode\nlaunch\n`;
  writeFileSync(sessionPath, template);
  return sessionPath;
}

function switchToSession(sessionPath: string, onSuccess?: () => void) {
  const socket = getKittySocket();
  if (!socket) {
    showToast({
      style: Toast.Style.Failure,
      title: "Kitty not running",
      message: "No socket found",
    });
    return;
  }
  try {
    execSync(
      `"${KITTEN}" @ --to "unix:${socket}" action goto_session "${sessionPath}"`,
    );
    execSync(`osascript -e 'tell application "kitty" to activate'`);
    closeMainWindow();
    showToast({
      style: Toast.Style.Success,
      title: "Switched session",
      message: basename(sessionPath, ".kitty-session"),
    });
    onSuccess?.();
  } catch (error) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to switch",
      message: String(error),
    });
  }
}

function normalizeSessionName(name: string): string {
  return name.trim().replace(/\s+/g, "-");
}

function renameSession(session: Session, newName: string): boolean {
  const nextName = normalizeSessionName(newName);
  if (!nextName) {
    showToast({ style: Toast.Style.Failure, title: "Name required" });
    return false;
  }
  if (nextName === session.name) {
    return true;
  }
  const nextPath = join(SESSIONS_DIR, `${nextName}.kitty-session`);
  if (existsSync(nextPath)) {
    showToast({ style: Toast.Style.Failure, title: "Session already exists" });
    return false;
  }
  try {
    renameSync(session.path, nextPath);
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

function SessionsList({
  sessions,
  setSessions,
  activeCwds,
  notifications,
  refreshNotifications,
  showActiveIndicator,
}: {
  sessions: Session[];
  setSessions: Dispatch<SetStateAction<Session[]>>;
  activeCwds: Set<string>;
  notifications: Record<string, number>;
  refreshNotifications: () => Promise<void>;
  showActiveIndicator: boolean;
}) {
  const { push } = useNavigation();
  return (
    <>
      {sessions.length === 0 ? (
        <List.EmptyView
          title="No Sessions"
          description="Use the 'Projects' tab to create one"
          icon={Icon.Terminal}
        />
      ) : (
        sessions.map((session) => {
          const active = isSessionActive(session, activeCwds);
          const notificationCount = notifications[session.name] ?? 0;
          const accessories = [] as List.Item.Accessory[];

          if (notificationCount > 0) {
            accessories.push({
              icon: {
                source: Icon.Bell,
                tintColor: Color.Red,
              },
              text: String(notificationCount),
              tooltip: `${notificationCount} notification${notificationCount === 1 ? "" : "s"}`,
            });
          }

          if (showActiveIndicator && active) {
            accessories.push({
              icon: {
                source: Icon.CircleFilled,
                tintColor: Color.Green,
              },
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
                  .find((l) => l.startsWith("cd "))
                  ?.replace("cd ", "") || ""
              }
              icon={Icon.Terminal}
              accessories={accessories}
              actions={
                <ActionPanel>
                  <Action
                    title="Switch to Session"
                    icon={Icon.ArrowRight}
                    onAction={() => switchToSession(session.path)}
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
                        await refreshNotifications();
                      }}
                    />
                  ) : null}
                  <Action
                    title="Rename Session"
                    icon={Icon.Pencil}
                    shortcut={{ modifiers: ["ctrl"], key: "r" }}
                    onAction={() =>
                      push(
                        <RenameSessionForm
                          session={session}
                          setSessions={setSessions}
                        />,
                      )
                    }
                  />
                  <Action
                    title="Delete Session"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={async () => {
                      if (
                        await confirmAlert({
                          title: `Delete "${session.name}"?`,
                          message: `This will remove ${basename(session.path)}`,
                          primaryAction: {
                            title: "Delete",
                            style: Alert.ActionStyle.Destructive,
                          },
                        })
                      ) {
                        try {
                          unlinkSync(session.path);
                          setSessions((prev: Session[]) =>
                            prev.filter(
                              (s: Session) => s.name !== session.name,
                            ),
                          );
                          showToast({
                            style: Toast.Style.Success,
                            title: "Deleted",
                            message: session.name,
                          });
                        } catch (error) {
                          showToast({
                            style: Toast.Style.Failure,
                            title: "Failed to delete",
                            message: String(error),
                          });
                        }
                      }
                    }}
                  />
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
  setSessions,
}: {
  session: Session;
  setSessions: Dispatch<SetStateAction<Session[]>>;
}) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`Rename ${session.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename"
            onSubmit={(values: { name: string }) => {
              if (renameSession(session, values.name)) {
                setSessions(getSessionFiles());
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

function ProjectsList({
  sessionNames,
  onSessionCreated,
}: {
  sessionNames: Set<string>;
  onSessionCreated: () => void;
}) {
  const [projects, setProjects] = useState<ProjectDir[]>([]);

  useEffect(() => {
    setProjects(getProjectDirs(sessionNames));
  }, [sessionNames]);

  return (
    <>
      {projects.length === 0 ? (
        <List.EmptyView
          title="No Projects Found"
          description="All git repos already have sessions"
          icon={Icon.Folder}
        />
      ) : (
        projects.map((project: ProjectDir) => (
          <List.Item
            key={project.path}
            title={project.name}
            subtitle={project.relativePath.replace(`/${project.name}`, "")}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action
                  title="Create Session and Switch"
                  icon={Icon.Plus}
                  onAction={() => {
                    const sessionPath = createSessionFromTemplate(project.path);
                    switchToSession(sessionPath, onSessionCreated);
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

export default function Command() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeCwds, setActiveCwds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<Record<string, number>>(
    {},
  );
  const [tab, setTab] = useState<string>("active");

  const refreshNotifications = async () => {
    setNotifications(await getNotifications());
  };

  useEffect(() => {
    setSessions(getSessionFiles());
    setActiveCwds(getActiveCwds());
    void getNotifications().then(setNotifications);
  }, []);

  const sessionNames = new Set<string>(sessions.map((s: Session) => s.name));

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const notificationDiff =
          (notifications[b.name] ?? 0) - (notifications[a.name] ?? 0);
        if (notificationDiff !== 0) return notificationDiff;

        const activeDiff =
          Number(isSessionActive(b, activeCwds)) -
          Number(isSessionActive(a, activeCwds));
        if (activeDiff !== 0) return activeDiff;

        return a.name.localeCompare(b.name);
      }),
    [sessions, notifications, activeCwds],
  );

  const activeSessions = useMemo(
    () => sortedSessions.filter((s: Session) => isSessionActive(s, activeCwds)),
    [sortedSessions, activeCwds],
  );

  const placeholders: Record<string, string> = {
    active: "Search active sessions...",
    all: "Search sessions...",
    projects: "Search projects...",
  };

  return (
    <List
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
        </List.Dropdown>
      }
    >
      {tab === "active" ? (
        <SessionsList
          sessions={activeSessions}
          setSessions={setSessions}
          activeCwds={activeCwds}
          notifications={notifications}
          refreshNotifications={refreshNotifications}
          showActiveIndicator={false}
        />
      ) : tab === "all" ? (
        <SessionsList
          sessions={sortedSessions}
          setSessions={setSessions}
          activeCwds={activeCwds}
          notifications={notifications}
          refreshNotifications={refreshNotifications}
          showActiveIndicator={true}
        />
      ) : (
        <ProjectsList
          sessionNames={sessionNames}
          onSessionCreated={() => setSessions(getSessionFiles())}
        />
      )}
    </List>
  );
}
