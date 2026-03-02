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
import { homedir } from "os";
import { join, basename } from "path";
import { useState, useEffect, useMemo } from "react";

const SESSIONS_DIR = join(homedir(), ".config", "kitty", "sessions");
const PROJECTS_DIR = join(homedir(), "Projects");
const KITTEN = "/Applications/kitty.app/Contents/MacOS/kitten";
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

function getKittySocket(): string | null {
  try {
    const files = readdirSync("/tmp").filter((f) => f.startsWith("mykitty-"));
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
        (f) => f.endsWith(".kitty-session") && f !== "template.kitty-session",
      )
      .map((f) => {
        const fullPath = join(SESSIONS_DIR, f);
        return {
          name: basename(f, ".kitty-session"),
          path: fullPath,
          content: readFileSync(fullPath, "utf-8").trim(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
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
  showActiveIndicator,
}: {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeCwds: Set<string>;
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
              accessories={
                showActiveIndicator && active
                  ? [
                      {
                        icon: {
                          source: Icon.CircleFilled,
                          tintColor: Color.Green,
                        },
                        tooltip: "Running",
                      },
                    ]
                  : []
              }
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
                          setSessions((prev) =>
                            prev.filter((s) => s.name !== session.name),
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
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
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
        projects.map((project) => (
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
  const [tab, setTab] = useState<string>("active");

  useEffect(() => {
    setSessions(getSessionFiles());
    setActiveCwds(getActiveCwds());
  }, []);

  const sessionNames = new Set(sessions.map((s) => s.name));

  const activeSessions = useMemo(
    () => sessions.filter((s) => isSessionActive(s, activeCwds)),
    [sessions, activeCwds],
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
          showActiveIndicator={false}
        />
      ) : tab === "all" ? (
        <SessionsList
          sessions={sessions}
          setSessions={setSessions}
          activeCwds={activeCwds}
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
