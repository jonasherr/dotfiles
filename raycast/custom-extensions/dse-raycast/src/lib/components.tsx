import { List, Action, ActionPanel, Icon, Color, closeMainWindow, showToast, Toast } from "@raycast/api";
import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { ParsedTicket, stateColor } from "./linear.js";
import { ensureClientWorkdir } from "./utils.js";

const KITTEN = "/Applications/kitty.app/Contents/MacOS/kitten";
const SESSIONS_DIR = join(homedir(), ".config", "kitty", "sessions");
const SESSION_FILE = join(SESSIONS_DIR, "agent-help.kitty-session");

function getKittySocket(): string | null {
  try {
    const files = readdirSync("/tmp").filter((f) => f.startsWith("mykitty-"));
    return files.length > 0 ? join("/tmp", files[0]) : null;
  } catch {
    return null;
  }
}

function switchToAgentHelp(customerName: string) {
  const socket = getKittySocket();
  if (!socket) {
    showToast({ style: Toast.Style.Failure, title: "Kitty not running", message: "No socket found" });
    return;
  }
  try {
    const dir = ensureClientWorkdir(customerName);
    const to = `--to "unix:${socket}"`;
    execSync(`"${KITTEN}" @ ${to} action goto_session "${SESSION_FILE}"`);
    execSync(`"${KITTEN}" @ ${to} launch --type=tab --cwd=${JSON.stringify(dir)} --match session:agent-help`);
    execSync(`osascript -e 'tell application "kitty" to activate'`);
    closeMainWindow();
  } catch (error) {
    showToast({ style: Toast.Style.Failure, title: "Failed to switch", message: String(error) });
  }
}

export function TicketItem({ ticket }: { ticket: ParsedTicket }) {
  const { issue, customerName, adminLink, slackThreadUrl } = ticket;
  const accessories: List.Item.Accessory[] = [];

  accessories.push({
    tag: { value: issue.state.name, color: stateColor(issue.state.name) },
  });

  for (const label of issue.labels) {
    accessories.push({ tag: { value: label.name, color: Color.SecondaryText } });
  }

  return (
    <List.Item
      key={issue.identifier}
      title={issue.title}
      subtitle={customerName ?? undefined}
      keywords={[issue.identifier, customerName ?? ""].filter(Boolean)}
      accessories={accessories}
      icon={{ source: Icon.Circle, tintColor: stateColor(issue.state.name) }}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open in Linear" url={issue.url} icon={Icon.Link} />
          {slackThreadUrl && (
            <Action.OpenInBrowser
              title="Open Slack Thread"
              url={slackThreadUrl}
              icon={Icon.Message}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
            />
          )}
          {adminLink && (
            <Action.OpenInBrowser
              title="Open Admin Link"
              url={adminLink}
              icon={Icon.Globe}
              shortcut={{ modifiers: ["cmd"], key: "a" }}
            />
          )}
          {customerName && (
            <Action
              title="Open Client Workdir"
              icon={Icon.Folder}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
              onAction={() => {
                switchToAgentHelp(customerName);
              }}
            />
          )}
          <Action.CopyToClipboard
            title="Copy Identifier"
            content={issue.identifier}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy URL"
            content={issue.url}
            shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
          />
        </ActionPanel>
      }
    />
  );
}
