import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { requestParentApproval } from "./lib/damage-control-approval-broker";
import { requestDamageControlApproval } from "./lib/damage-control-approval-ui";
import { isSecretPath } from "./lib/bash-risk";
import { inspectBashCommand } from "./lib/bash-inspection";
import {
  detectTemporaryPathWrite,
  isGeneratedPath,
  TEMPORARY_WORKSPACE_POLICY,
} from "./lib/damage-control-safety";

const TOOL_WARN_BYTES = 20 * 1024;
const TOOL_SUMMARIZE_BYTES = 50 * 1024;
const TOOL_HEAD_LINES = 50;
const TOOL_TAIL_LINES = 50;
const MAX_LINE_CHARS = 1200;
const HIGH_RISK_OUTPUT_MIN_BYTES = TOOL_WARN_BYTES;
const CONTEXT_WARN_PERCENT = 70;
const CONTEXT_STRONG_WARN_PERCENT = 85;
const CONTEXT_CRITICAL_WARN_PERCENT = 95;

let consecutiveZeroTokenProviderErrors = 0;
let lastContextWarningLevel: "none" | "warn" | "strong" | "critical" = "none";

type TextContent = {
  type: "text";
  text: string;
  [key: string]: unknown;
};

type Risk = {
  category: string;
  matched: string;
  subject: string;
};

function detectReadRisk(path: string): Risk | undefined {
  if (isSecretPath(path)) {
    return {
      category: "Reading secret/credential file",
      matched: "path is a conventional secret or credential file",
      subject: path,
    };
  }
  return undefined;
}

function detectWriteRisk(path: string): Risk | undefined {
  if (isSecretPath(path)) {
    return {
      category: "Writing to secret/credential file",
      matched: "path is a conventional secret or credential file",
      subject: path,
    };
  }
  return undefined;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r?\n/);
}

function truncateLongLines(lines: string[]): string[] {
  return lines.map((line) => {
    if (line.length <= MAX_LINE_CHARS) return line;
    return `${line.slice(0, MAX_LINE_CHARS)} [damage-control: line truncated from ${line.length} chars]`;
  });
}

function getTextParts(content: unknown): TextContent[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (part): part is TextContent =>
      Boolean(part) &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string",
  );
}

function getCombinedText(content: unknown): string | undefined {
  const parts = getTextParts(content);
  if (parts.length === 0) return undefined;
  return parts.map((part) => part.text).join("\n");
}

function getSubjectFromToolResult(event: {
  toolName: string;
  input: Record<string, unknown>;
}): string | undefined {
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    return event.input.command;
  }

  if (typeof event.input.path === "string") return event.input.path;
  if (typeof event.input.pattern === "string") return event.input.pattern;
  return undefined;
}

function getPathSubjectFromToolResult(event: {
  toolName: string;
  input: Record<string, unknown>;
}): string | undefined {
  if (event.toolName === "bash") return undefined;
  return typeof event.input.path === "string" ? event.input.path : undefined;
}

function detectHighRiskOutput(
  event: {
    toolName: string;
    input: Record<string, unknown>;
    content: unknown;
  },
  size: number,
): string[] {
  if (size < HIGH_RISK_OUTPUT_MIN_BYTES) return [];

  const pathSubject = getPathSubjectFromToolResult(event) ?? "";
  const text = getCombinedText(event.content) ?? "";
  const sample = text.slice(0, 8192);
  const reasons: string[] = [];

  if (/\.map(?:$|[?#])/.test(pathSubject)) reasons.push("source map output");
  if (/(^|\/)node_modules(\/|$)/.test(pathSubject))
    reasons.push("node_modules output");
  if (/(^|\/)(\.next|dist|build|coverage)(\/|$)/.test(pathSubject)) {
    reasons.push("generated build output");
  }
  if (/\.(min|bundle)\.(js|css)(?:$|[?#])/.test(pathSubject)) {
    reasons.push("minified or bundled asset");
  }
  if (
    /^\s*</.test(sample) &&
    /<(html|body|div|script|style|svg)\b/i.test(sample)
  ) {
    reasons.push("raw HTML/SVG blob");
  }
  if (
    /^\s*[\[{]/.test(sample) &&
    /[\]}]\s*$/.test(text.trimEnd().slice(-200))
  ) {
    reasons.push("raw JSON-like blob");
  }

  return Array.from(new Set(reasons));
}

function extractExistingFullOutputPath(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { fullOutputPath?: unknown }).fullOutputPath;
  return typeof value === "string" ? value : undefined;
}

function getOriginalToolSize(details: unknown, fallbackText: string) {
  const fallback = {
    bytes: byteLength(fallbackText),
    lines: splitLines(fallbackText).length,
  };

  if (!details || typeof details !== "object") return fallback;
  const truncation = (details as { truncation?: unknown }).truncation;
  if (!truncation || typeof truncation !== "object") return fallback;

  const maybeTruncation = truncation as {
    totalBytes?: unknown;
    totalLines?: unknown;
  };
  return {
    bytes:
      typeof maybeTruncation.totalBytes === "number"
        ? maybeTruncation.totalBytes
        : fallback.bytes,
    lines:
      typeof maybeTruncation.totalLines === "number"
        ? maybeTruncation.totalLines
        : fallback.lines,
  };
}

async function saveToolOutput(text: string, toolName: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pi-damage-control-"));
  const safeToolName = toolName.replace(/[^a-z0-9_-]/gi, "-") || "tool";
  const path = join(dir, `${safeToolName}-output.txt`);
  await writeFile(path, text, "utf8");
  return path;
}

function buildToolSummary(options: {
  text: string;
  toolName: string;
  subject?: string;
  savedPath: string;
  existingFullOutputPath?: string;
  reasons: string[];
  summarize: boolean;
  originalBytes?: number;
  originalLines?: number;
}): string {
  const lines = splitLines(options.text);
  const availableLines = lines.length;
  const totalLines = options.originalLines ?? availableLines;
  const totalBytes = options.originalBytes ?? byteLength(options.text);
  const headLines = truncateLongLines(lines.slice(0, TOOL_HEAD_LINES));
  const tailStart = Math.max(TOOL_HEAD_LINES, availableLines - TOOL_TAIL_LINES);
  const tailLines = truncateLongLines(lines.slice(tailStart));
  const omittedLines = Math.max(
    0,
    totalLines - headLines.length - tailLines.length,
  );
  const reasonLines = [
    ...(totalBytes >
    (options.summarize ? TOOL_SUMMARIZE_BYTES : TOOL_WARN_BYTES)
      ? [
          options.summarize
            ? `output exceeds ${formatBytes(TOOL_SUMMARIZE_BYTES)}`
            : `output exceeds ${formatBytes(TOOL_WARN_BYTES)}`,
        ]
      : []),
    ...options.reasons,
  ];

  const header = [
    `[damage-control] ${options.summarize ? "Large tool result summarized" : "Large/high-risk tool result saved"} before entering model context.`,
    "",
    `Tool: ${options.toolName}`,
    options.subject ? `Subject: ${options.subject}` : undefined,
    `Size: ${formatBytes(totalBytes)}, ${totalLines} lines`,
    `Reason: ${reasonLines.join(", ")}`,
    `Saved full output: ${options.savedPath}`,
    options.existingFullOutputPath &&
    options.existingFullOutputPath !== options.savedPath
      ? `Tool-provided full output: ${options.existingFullOutputPath}`
      : undefined,
    "",
    "The agent can inspect the rest with the read tool using offset/limit on the saved file.",
  ].filter((line): line is string => typeof line === "string");

  if (!options.summarize) {
    return [header.join("\n"), "", options.text].join("\n");
  }

  return [
    header.join("\n"),
    "",
    `--- first ${headLines.length} lines ---`,
    headLines.join("\n"),
    "",
    `--- omitted ${omittedLines} lines ---`,
    "",
    `--- last ${tailLines.length} lines ---`,
    tailLines.join("\n"),
  ].join("\n");
}

async function summarizeLargeToolResult(event: {
  toolName: string;
  input: Record<string, unknown>;
  content: unknown;
  details: unknown;
}) {
  const text = getCombinedText(event.content);
  if (text === undefined) return undefined;

  const originalSize = getOriginalToolSize(event.details, text);
  const size = Math.max(byteLength(text), originalSize.bytes);
  const reasons = detectHighRiskOutput(event, size);
  const shouldWarn = size > TOOL_WARN_BYTES || reasons.length > 0;
  const shouldSummarize = size > TOOL_SUMMARIZE_BYTES;

  if (!shouldWarn && !shouldSummarize) return undefined;

  const existingFullOutputPath = extractExistingFullOutputPath(event.details);
  const savedPath =
    existingFullOutputPath ?? (await saveToolOutput(text, event.toolName));
  const summary = buildToolSummary({
    text,
    toolName: event.toolName,
    subject: getSubjectFromToolResult(event),
    savedPath,
    existingFullOutputPath,
    reasons,
    summarize: shouldSummarize,
    originalBytes: originalSize.bytes,
    originalLines: originalSize.lines,
  });

  return {
    content: [{ type: "text" as const, text: summary }],
    details:
      event.details && typeof event.details === "object"
        ? { ...event.details, fullOutputPath: savedPath }
        : { fullOutputPath: savedPath },
  };
}

function getMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const maybeText = part as { text?: unknown; thinking?: unknown };
      if (typeof maybeText.text === "string") return maybeText.text;
      if (typeof maybeText.thinking === "string") return maybeText.thinking;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function isZeroTokenProviderError(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const maybeMessage = message as {
    role?: unknown;
    stopReason?: unknown;
    errorMessage?: unknown;
    usage?: { totalTokens?: unknown };
  };

  if (maybeMessage.role !== "assistant") return false;
  if (maybeMessage.stopReason !== "error") return false;
  if (maybeMessage.usage?.totalTokens !== 0) return false;

  const text = `${typeof maybeMessage.errorMessage === "string" ? maybeMessage.errorMessage : ""}\n${getMessageText(message)}`;
  return /api[_ -]?error|provider|context|tokens?|overloaded|upstream|request failed|empty response|stream error|generic/i.test(
    text,
  );
}

function getLastAssistantMessage(messages: unknown[]): unknown | undefined {
  return [...messages]
    .reverse()
    .find(
      (message) =>
        Boolean(message) &&
        typeof message === "object" &&
        (message as { role?: unknown }).role === "assistant",
    );
}

async function handleProviderRecovery(
  pi: ExtensionAPI,
  event: { messages: unknown[] },
  ctx: ExtensionContext,
) {
  const lastAssistant = getLastAssistantMessage(event.messages);

  if (isZeroTokenProviderError(lastAssistant)) {
    const errorMessage =
      lastAssistant &&
      typeof lastAssistant === "object" &&
      typeof (lastAssistant as { errorMessage?: unknown }).errorMessage ===
        "string"
        ? (lastAssistant as { errorMessage: string }).errorMessage
        : "The provider returned an empty or failed response.";
    reportHerdrBlocked(pi, "Pi provider failure", errorMessage);

    consecutiveZeroTokenProviderErrors += 1;
    const baseMessage =
      "The last assistant turn failed before the provider returned tokens. This often means the session context is too large or the provider hit a recovery issue. Use /tree and retry from the parent, compact before continuing, or fork from the last healthy turn. Do not keep typing continue.";

    if (consecutiveZeroTokenProviderErrors === 1) {
      ctx.ui.notify(`[damage-control] ${baseMessage}`, "warning");
      return;
    }

    const repeatedMessage = `[damage-control] This is zero-token provider error #${consecutiveZeroTokenProviderErrors} in a row. Strongly recommend compacting or retrying from the last healthy turn with /tree before continuing.`;
    ctx.ui.notify(repeatedMessage, "error");

    if (!ctx.hasUI) return;

    try {
      const shouldCompact = await ctx.ui.confirm(
        "⚠️ Damage Control",
        `${repeatedMessage}\n\nTrigger compaction now?`,
      );

      if (shouldCompact) {
        ctx.compact({
          customInstructions:
            "Recover from repeated zero-token provider errors. Preserve the user's goal, files changed, commands run, important outputs, and next steps. Drop bulky raw tool output unless it is essential.",
          onComplete: () =>
            ctx.ui.notify("[damage-control] Compaction completed.", "info"),
          onError: (error) =>
            ctx.ui.notify(
              `[damage-control] Compaction failed: ${error.message}`,
              "error",
            ),
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `[damage-control] Could not ask to compact: ${detail}`,
        "error",
      );
    }

    return;
  }

  if (
    lastAssistant &&
    typeof lastAssistant === "object" &&
    (lastAssistant as { role?: unknown }).role === "assistant" &&
    (lastAssistant as { usage?: { totalTokens?: unknown } }).usage
      ?.totalTokens !== 0
  ) {
    consecutiveZeroTokenProviderErrors = 0;
  }
}

function warnIfContextIsHigh(ctx: ExtensionContext) {
  const usage = ctx.getContextUsage();
  if (!usage || usage.percent === null) return;

  const level =
    usage.percent >= CONTEXT_CRITICAL_WARN_PERCENT
      ? "critical"
      : usage.percent >= CONTEXT_STRONG_WARN_PERCENT
        ? "strong"
        : usage.percent >= CONTEXT_WARN_PERCENT
          ? "warn"
          : "none";

  if (level === "none") {
    lastContextWarningLevel = "none";
    return;
  }

  if (level === lastContextWarningLevel) return;
  lastContextWarningLevel = level;

  const message =
    level === "critical"
      ? `Context is critically high at ${usage.percent.toFixed(0)}%. Compact or fork before continuing.`
      : level === "strong"
        ? `Context is high at ${usage.percent.toFixed(0)}%. Consider compacting before more tool-heavy work.`
        : `Context is growing at ${usage.percent.toFixed(0)}%. If provider errors start, compact or fork instead of retrying blindly.`;

  ctx.ui.notify(
    `[damage-control] ${message}`,
    level === "warn" ? "warning" : "error",
  );
}

const pendingToolNotes = new Map<string, string[]>();

function addToolNote(toolCallId: string, note: string) {
  pendingToolNotes.set(toolCallId, [
    ...(pendingToolNotes.get(toolCallId) ?? []),
    note,
  ]);
}

function takeToolNotes(toolCallId: string): string[] {
  const notes = pendingToolNotes.get(toolCallId) ?? [];
  pendingToolNotes.delete(toolCallId);
  return notes;
}

let herdrBlockSequence = 0;

function reportHerdrBlocked(pi: ExtensionAPI, label: string, message?: string) {
  const id = `damage-control:${Date.now()}:${herdrBlockSequence++}`;
  pi.events.emit("herdr:blocked", {
    active: true,
    id,
    label,
    message,
  });
  return id;
}

function blockCatastrophicRisk(
  pi: ExtensionAPI,
  risk: Risk & { remediation?: string },
) {
  const label = `${risk.category}: ${risk.subject}`;
  reportHerdrBlocked(pi, label, risk.remediation);
  return {
    block: true,
    reason: risk.remediation
      ? `[damage-control] ${risk.category} blocked: ${risk.matched}. ${risk.remediation}`
      : `[damage-control] ${risk.category} blocked: ${risk.matched}. Rewrite the command with a narrow literal target. Variable-expanded recursive deletion must use a fail-closed \${VAR:?message} expansion.`,
  };
}

async function requestApproval(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  risk: Risk,
) {
  const label = `${risk.category}: ${risk.subject}`;
  const id = reportHerdrBlocked(pi, label, risk.remediation);

  try {
    const parentResponse = await requestParentApproval(risk);
    if (parentResponse) {
      if (parentResponse.error) {
        return {
          block: true,
          reason: `[damage-control] ${risk.category} blocked because parent approval failed: ${parentResponse.error}`,
        };
      }
      if (!parentResponse.approved) {
        return {
          block: true,
          reason: `[damage-control] ${risk.category} blocked by user`,
        };
      }
      return undefined;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `[damage-control] ${risk.category} blocked because no UI is available for human approval`,
      };
    }

    try {
      const approved = await requestDamageControlApproval(ctx, risk);
      if (!approved) {
        return {
          block: true,
          reason: `[damage-control] ${risk.category} blocked by user`,
        };
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        block: true,
        reason: `[damage-control] ${risk.category} blocked because approval failed: ${detail}`,
      };
    }

    return undefined;
  } finally {
    // Approval prompts are transient. Hard blocks are cleared by the next
    // agent_start event because they have no matching approval lifecycle.
    pi.events.emit("herdr:blocked", {
      active: false,
      id,
      label,
      message: risk.remediation,
    });
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    warnIfContextIsHigh(ctx);
    return {
      systemPrompt: `${event.systemPrompt}\n\n# Temporary artifacts\n\n${TEMPORARY_WORKSPACE_POLICY} This policy applies to the main agent and all subagents.`,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    pendingToolNotes.clear();
    await handleProviderRecovery(pi, event, ctx);
  });

  pi.on("tool_result", async (event) => {
    const notes = takeToolNotes(event.toolCallId);
    const summarized = await summarizeLargeToolResult(event);
    if (notes.length === 0) return summarized;
    return {
      ...summarized,
      content: [
        ...(summarized?.content ?? event.content),
        { type: "text" as const, text: notes.join("\n") },
      ],
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && typeof event.input.command === "string") {
      const inspection = await inspectBashCommand(event.input.command, {
        cwd: ctx.cwd,
        interactive: ctx.hasUI,
        primaryCheckout: process.env.PI_PRIMARY_CHECKOUT,
      });
      for (const note of inspection.notes) addToolNote(event.toolCallId, note);
      if (inspection.decision === "block")
        return blockCatastrophicRisk(pi, inspection.risk);
      if (inspection.decision === "ask")
        return requestApproval(pi, ctx, inspection.risk);
    }

    if (event.toolName === "read" && typeof event.input.path === "string") {
      const risk = detectReadRisk(event.input.path);
      if (risk) return requestApproval(pi, ctx, risk);
    }

    if (
      (event.toolName === "edit" || event.toolName === "write") &&
      typeof event.input.path === "string"
    ) {
      const temporaryWriteRisk = detectTemporaryPathWrite(event.input.path);
      if (temporaryWriteRisk)
        return blockCatastrophicRisk(pi, temporaryWriteRisk);

      const risk = detectWriteRisk(event.input.path);
      if (risk) return requestApproval(pi, ctx, risk);

      // Editing generated output or a lockfile is not destructive, just
      // usually overwritten, so the model gets a note instead of a prompt.
      if (await isGeneratedPath(event.input.path, ctx.cwd)) {
        addToolNote(
          event.toolCallId,
          `[damage-control] Note: ${event.input.path} is generated output or a lockfile. Edits are usually overwritten; change the source or rerun the tool that generates it.`,
        );
      }
    }

    return undefined;
  });
}
