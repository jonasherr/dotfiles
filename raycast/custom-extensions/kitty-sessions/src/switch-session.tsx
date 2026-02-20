import { Action, ActionPanel, Alert, Icon, List, confirmAlert, showToast, Toast, closeMainWindow } from "@raycast/api";
import { execSync } from "child_process";
import { readdirSync, readFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { useState, useEffect } from "react";

interface Session {
  name: string;
  path: string;
  content: string;
}

function getKittySocket(): string | null {
  try {
    const files = readdirSync("/tmp").filter((f) => f.startsWith("mykitty-"));
    return files.length > 0 ? join("/tmp", files[0]) : null;
  } catch {
    return null;
  }
}

function getSessionFiles(): Session[] {
  const sessionsDir = join(homedir(), ".config", "kitty", "sessions");
  try {
    const files = readdirSync(sessionsDir).filter(
      (f) => f.endsWith(".kitty-session") && f !== "template.kitty-session"
    );
    return files
      .map((f) => {
        const fullPath = join(sessionsDir, f);
        const content = readFileSync(fullPath, "utf-8").trim();
        return {
          name: basename(f, ".kitty-session"),
          path: fullPath,
          content,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function switchToSession(sessionPath: string) {
  const socket = getKittySocket();
  if (!socket) {
    showToast({ style: Toast.Style.Failure, title: "Kitty not running", message: "No socket found" });
    return;
  }

  try {
    const kitten = "/Applications/kitty.app/Contents/MacOS/kitten";
    execSync(`"${kitten}" @ --to "unix:${socket}" action goto_session "${sessionPath}"`);
    execSync(`osascript -e 'tell application "kitty" to activate'`);
    closeMainWindow();
    showToast({
      style: Toast.Style.Success,
      title: "Switched session",
      message: basename(sessionPath, ".kitty-session"),
    });
  } catch (error) {
    showToast({ style: Toast.Style.Failure, title: "Failed to switch", message: String(error) });
  }
}

export default function Command() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    setSessions(getSessionFiles());
  }, []);

  return (
    <List searchBarPlaceholder="Search sessions...">
      {sessions.length === 0 ? (
        <List.EmptyView
          title="No Sessions Found"
          description="Add .kitty-session files to ~/.config/kitty/sessions/"
          icon={Icon.Terminal}
        />
      ) : (
        sessions.map((session) => (
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
            accessories={[]}
            actions={
              <ActionPanel>
                <Action
                  title="Switch to Session"
                  icon={Icon.ArrowRight}
                  onAction={() => switchToSession(session.path)}
                />
                <Action.ShowInFinder title="Show Session File" path={session.path} />
                <Action.CopyToClipboard title="Copy Session Path" content={session.path} />
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
                        primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
                      })
                    ) {
                      try {
                        unlinkSync(session.path);
                        setSessions((prev) => prev.filter((s) => s.name !== session.name));
                        showToast({ style: Toast.Style.Success, title: "Deleted", message: session.name });
                      } catch (error) {
                        showToast({ style: Toast.Style.Failure, title: "Failed to delete", message: String(error) });
                      }
                    }
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
