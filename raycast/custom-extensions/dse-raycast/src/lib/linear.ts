import { promisify } from "util";
import { exec } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";
import { Color } from "@raycast/api";

const execAsync = promisify(exec);

function getLinearApiKey(): string {
  const credPath = join(homedir(), ".config", "vercel-linear-cli", "credentials");
  const content = readFileSync(credPath, "utf-8");
  const match = content.match(/LINEAR_API_KEY="([^"]+)"/);
  if (!match) throw new Error("LINEAR_API_KEY not found in credentials");
  return match[1];
}

export interface LinearIssue {
  identifier: string;
  title: string;
  description: string;
  state: { name: string; type: string };
  priority: number;
  priorityLabel: string;
  url: string;
  labels: Array<{ name: string; color: string }>;
  project: { name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedTicket {
  issue: LinearIssue;
  customerName: string | null;
  adminLink: string | null;
  teamId: string | null;
  slackThreadUrl: string | null;
}

const CUSTOMER_RE = /\*\*Customer\*\*\s*\n\s*`([^`]+)`/;
const ADMIN_LINK_RE = /https:\/\/admin\.vercel\.com\/team\/team_[a-zA-Z0-9]+/;

function parseIssue(issue: LinearIssue, slackUrl: string | null): ParsedTicket {
  const desc = issue.description ?? "";
  const customerMatch = desc.match(CUSTOMER_RE);
  const adminMatch = desc.match(ADMIN_LINK_RE);
  const adminLink = adminMatch ? adminMatch[0] : null;
  const teamId = adminLink ? adminLink.split("/team/")[1] : null;

  return {
    issue,
    customerName: customerMatch ? customerMatch[1] : null,
    adminLink,
    teamId,
    slackThreadUrl: slackUrl,
  };
}

async function fetchSlackUrls(issueIds: string[]): Promise<Map<string, string>> {
  const apiKey = getLinearApiKey();
  // Batch query: fetch slack attachments for all issues at once
  const fragments = issueIds.map(
    (id, i) => `i${i}: issue(id: "${id}") { attachments(filter: { sourceType: { eq: "slack" } }) { nodes { url } } }`,
  );
  const query = `{ ${fragments.join(" ")} }`;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const json = (await res.json()) as {
    data?: Record<string, { attachments: { nodes: Array<{ url: string }> } }>;
  };

  const map = new Map<string, string>();
  if (!json.data) return map;

  issueIds.forEach((id, i) => {
    const nodes = json.data?.[`i${i}`]?.attachments?.nodes;
    if (nodes && nodes.length > 0) {
      map.set(id, nodes[0].url);
    }
  });
  return map;
}

export async function fetchTickets(): Promise<ParsedTicket[]> {
  const { team } = getPreferenceValues<{ team: string }>();
  const cmd = `linear-cli issues list --team ${team} --me --open --sort priority --json`;

  // Use login shell to get fnm-managed PATH
  const { stdout } = await execAsync(`/bin/zsh -lc '${cmd}'`, {
    timeout: 15000,
  });

  const json = JSON.parse(stdout);
  const issues: LinearIssue[] = json.data ?? json;

  // Fetch Slack thread URLs via Linear GraphQL API
  const slackUrls = await fetchSlackUrls(issues.map((i) => i.identifier));

  return issues.map((issue) => parseIssue(issue, slackUrls.get(issue.identifier) ?? null));
}

export async function fetchTeamTickets(): Promise<ParsedTicket[]> {
  const { team } = getPreferenceValues<{ team: string }>();
  const cmd = `linear-cli issues list --team ${team} --open --sort priority --json`;

  const { stdout } = await execAsync(`/bin/zsh -lc '${cmd}'`, {
    timeout: 15000,
  });

  const json = JSON.parse(stdout);
  const issues: LinearIssue[] = json.data ?? json;

  const slackUrls = await fetchSlackUrls(issues.map((i) => i.identifier));

  return issues.map((issue) => parseIssue(issue, slackUrls.get(issue.identifier) ?? null));
}

export const STATE_ORDER = ["In Progress", "Todo", "Waiting", "Triage"];

export function groupByState(tickets: ParsedTicket[]): Map<string, ParsedTicket[]> {
  const groups = new Map<string, ParsedTicket[]>();
  for (const state of STATE_ORDER) {
    groups.set(state, []);
  }
  for (const ticket of tickets) {
    const stateName = ticket.issue.state.name;
    const existing = groups.get(stateName);
    if (existing) {
      existing.push(ticket);
    } else {
      groups.set(stateName, [ticket]);
    }
  }
  return groups;
}

export function stateColor(stateName: string): Color {
  switch (stateName) {
    case "In Progress":
      return Color.Blue;
    case "Todo":
      return Color.Orange;
    case "Waiting":
      return Color.Yellow;
    case "Triage":
      return Color.Purple;
    default:
      return Color.SecondaryText;
  }
}

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''" ) + "'"
}

export async function fetchLabelGroup(groupName: string): Promise<Array<{ id: string; name: string; color: string; description?: string | null }>> {
  const apiKey = getLinearApiKey()
  const query = `
    query GetLabelWithChildren($labelName: String!) {
      issueLabels(filter: { name: { eq: $labelName } }) {
        nodes {
          children {
            nodes {
              id
              name
              color
              description
            }
          }
        }
      }
    }
  `
  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { labelName: groupName } }),
    })
    const json = (await res.json()) as {
      data?: {
        issueLabels?: {
          nodes?: Array<{
            children?: {
              nodes?: Array<{ id: string; name: string; color: string; description?: string | null }>
            }
          }>
        }
      }
    }
    const nodes = json.data?.issueLabels?.nodes ?? []
    if (nodes.length > 0 && nodes[0].children?.nodes) {
      return nodes[0].children.nodes
    }
    return []
  } catch {
    return []
  }
}

export function getCustomerMap(tickets: ParsedTicket[]): Map<string, string | null> {
  const map = new Map<string, string | null>()
  for (const ticket of tickets) {
    if (ticket.customerName && !map.has(ticket.customerName)) {
      map.set(ticket.customerName, ticket.teamId)
    }
  }
  return map
}

export async function createLinearTicket(opts: {
  title: string
  description: string
  customerName?: string
  teamId?: string
  labels: string[]
}): Promise<{ success: boolean; url?: string; identifier?: string; error?: string }> {
  const { team } = getPreferenceValues<{ team: string }>()

  // Format description: prepend team_id and customer name if provided
  const parts: string[] = []
  if (opts.teamId) {
    const tid = opts.teamId.startsWith("team_") ? opts.teamId : `team_${opts.teamId}`
    parts.push(tid)
  }
  if (opts.customerName) {
    parts.push(`**Customer**\n\`${opts.customerName}\``)
  }
  const formattedDesc = parts.length > 0
    ? parts.join("\n\n") + "\n\n" + opts.description
    : opts.description

  // Pass user content via env vars to avoid shell injection
  // (shellEscape produces single-quoted strings which would break the outer /bin/zsh -lc '...' wrapper)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TICKET_TITLE: opts.title,
    TICKET_DESC: formattedDesc,
    TICKET_LABELS: opts.labels.join(","),
  }

  const labelPart = opts.labels.length > 0 ? '--labels "$TICKET_LABELS"' : ""
  const cmd = `linear-cli issues create --team ${team} --title "$TICKET_TITLE" --description "$TICKET_DESC" ${labelPart} --json`

  try {
    const { stdout } = await execAsync(`/bin/zsh -lc '${cmd}'`, { timeout: 15000, env })
    const json = JSON.parse(stdout) as {
      success: boolean
      data?: { identifier?: string; url?: string }
      error?: string
    }
    if (json.success && json.data) {
      return {
        success: true,
        url: json.data.url,
        identifier: json.data.identifier,
      }
    }
    return { success: false, error: json.error ?? "Unknown error" }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
