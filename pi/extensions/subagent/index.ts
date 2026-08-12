/**
 * Generic Subagent Tool
 *
 * Spawns disposable `pi -p --no-session` processes with isolated context.
 * No agent registry, no specialized personas. Just single or parallel background work.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import {
  type ExtensionAPI,
  getMarkdownTheme,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { createApprovalBroker } from "../lib/damage-control-approval-broker";
import {
  isWriteEnabledSubagent,
  resolveSubagentTools,
} from "../lib/subagent-tools";
import {
  createWorktreeIsolation,
  inspectWorktreeDirtyState,
  type WorktreeDirtyState,
  WorktreeIsolationError,
} from "../lib/worktree-isolation";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const COLLAPSED_OUTPUT_LINES = 12;

const SUBAGENT_SYSTEM_PROMPT = [
  "You are a disposable background agent spawned by a parent pi session.",
  "Work independently on the given task, then return a compact handoff.",
  "Do not ask the user questions. State assumptions and uncertainty instead.",
  "Keep output concise. Include file paths and verification when relevant.",
].join("\n");

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(usage: UsageStats, model?: string): string {
  const parts: string[] = [];
  if (usage.turns)
    parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens)
    parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  if (model) parts.push(model);
  return parts.join(" ");
}

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

type IsolationMode = "auto" | "worktree" | "none";

type IsolationMetadata =
  | {
      requested: IsolationMode;
      applied: "none";
      reason: "default" | "explicit-none" | "read-only";
    }
  | {
      requested: "auto" | "worktree";
      applied: "worktree";
      repositoryRoot: string;
      worktreePath: string;
      branch: string;
      baseCommit: string;
      requestedCwd: string;
      cwd: string;
      initialDirtyState: WorktreeDirtyState;
      finalDirtyState?: WorktreeDirtyState;
      retained: true;
      recovery: { inspect: string; list: string; remove: string };
    }
  | {
      requested: "auto" | "worktree";
      applied: "refused";
      reason: string;
      message: string;
    };

interface SubagentRunOptions {
  task: string;
  cwd?: string;
  model?: string;
  tools?: string[];
  readOnly?: boolean;
  isolation?: IsolationMode;
}

interface RunResult {
  task: string;
  cwd: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  thinking: "xhigh";
  stopReason?: string;
  errorMessage?: string;
  isolation: IsolationMetadata;
}

interface SubagentDetails {
  mode: "single" | "parallel";
  results: RunResult[];
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, any> };

function emptyUsage(): UsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
  };
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (const part of msg.content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
}

function formatIsolation(result: RunResult): string | undefined {
  if (result.isolation.applied === "none") return undefined;
  if (result.isolation.applied === "refused") {
    return `Isolation refused: ${result.isolation.message}`;
  }
  const state = result.isolation.finalDirtyState ?? result.isolation.initialDirtyState;
  return [
    `Worktree retained: ${result.isolation.worktreePath}`,
    `Branch: ${result.isolation.branch} (base ${result.isolation.baseCommit.slice(0, 12)})`,
    `State: ${state.dirty ? `staged:${state.stagedFiles}, unstaged:${state.unstagedFiles}, untracked:${state.untrackedFiles}, conflicted:${state.conflictedFiles}` : "clean"}`,
  ].join("\n");
}

function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.content) {
      if (part.type === "text") items.push({ type: "text", text: part.text });
      else if (part.type === "toolCall")
        items.push({ type: "toolCall", name: part.name, args: part.arguments });
    }
  }
  return items;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };

  return { command: "pi", args };
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function resolveTools(options: SubagentRunOptions): string[] {
  return resolveSubagentTools(options);
}

async function runPiSubagent(
  defaultCwd: string,
  options: SubagentRunOptions,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: RunResult[]) => SubagentDetails,
  env: NodeJS.ProcessEnv,
  owner: { sessionId: string; taskId: string },
): Promise<RunResult> {
  const requestedCwd = options.cwd ?? defaultCwd;
  const requestedIsolation = options.isolation ?? "none";
  const tools = resolveTools(options);
  let cwd = requestedCwd;
  let isolation: IsolationMetadata = {
    requested: requestedIsolation,
    applied: "none",
    reason: options.isolation === "none" ? "explicit-none" : "default",
  };

  if (requestedIsolation !== "none" && !isWriteEnabledSubagent(tools)) {
    isolation = {
      requested: requestedIsolation,
      applied: "none",
      reason: "read-only",
    };
  } else if (requestedIsolation !== "none") {
    try {
      const prepared = await createWorktreeIsolation({
        cwd: requestedCwd,
        sessionId: owner.sessionId,
        taskId: owner.taskId,
      });
      cwd = prepared.childCwd;
      isolation = {
        requested: requestedIsolation,
        applied: "worktree",
        repositoryRoot: prepared.repositoryRoot,
        worktreePath: prepared.worktreePath,
        branch: prepared.branch,
        baseCommit: prepared.baseCommit,
        requestedCwd,
        cwd,
        initialDirtyState: prepared.dirtyState,
        retained: true,
        recovery: prepared.recovery,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        task: options.task,
        cwd: requestedCwd,
        exitCode: 1,
        messages: [],
        stderr: "",
        usage: emptyUsage(),
        model: options.model,
        thinking: "xhigh",
        errorMessage: message,
        isolation: {
          requested: requestedIsolation,
          applied: "refused",
          reason:
            error instanceof WorktreeIsolationError ? error.code : "create-failed",
          message,
        },
      };
    }
  }

  const result: RunResult = {
    task: options.task,
    cwd,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model: options.model,
    thinking: "xhigh",
    isolation,
  };

  const args = [
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--append-system-prompt",
    SUBAGENT_SYSTEM_PROMPT,
    "--thinking",
    "xhigh",
  ];
  if (options.model?.trim()) args.push("--model", options.model);
  args.push("--tools", tools.join(","));
  args.push(`Task:\n\n${options.task}`);

  const emitUpdate = () => {
    onUpdate?.({
      content: [
        {
          type: "text",
          text: getFinalOutput(result.messages) || "(running...)",
        },
      ],
      details: makeDetails([result]),
    });
  };

  let wasAborted = false;

  const exitCode = await new Promise<number>((resolve) => {
    const invocation = getPiInvocation(args);
    const proc = spawn(invocation.command, invocation.args, {
      cwd,
      env:
        result.isolation.applied === "worktree"
          ? { ...env, PI_PRIMARY_CHECKOUT: result.isolation.repositoryRoot }
          : env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (event.type === "message_end" && event.message) {
        const msg = event.message as Message;
        result.messages.push(msg);

        if (msg.role === "assistant") {
          result.usage.turns++;
          const usage = msg.usage;
          if (usage) {
            result.usage.input += usage.input || 0;
            result.usage.output += usage.output || 0;
            result.usage.cacheRead += usage.cacheRead || 0;
            result.usage.cacheWrite += usage.cacheWrite || 0;
            result.usage.cost += usage.cost?.total || 0;
            result.usage.contextTokens = usage.totalTokens || 0;
          }
          if (!result.model && msg.model) result.model = msg.model;
          if (msg.stopReason) result.stopReason = msg.stopReason;
          if (msg.errorMessage) result.errorMessage = msg.errorMessage;
        }
        emitUpdate();
      }
    };

    proc.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data) => {
      result.stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (buffer.trim()) processLine(buffer);
      resolve(code ?? 0);
    });

    proc.on("error", () => resolve(1));

    if (signal) {
      const killProc = () => {
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      };
      if (signal.aborted) killProc();
      else signal.addEventListener("abort", killProc, { once: true });
    }
  });

  result.exitCode = exitCode;
  if (wasAborted) {
    result.exitCode = 1;
    result.errorMessage = "Subagent was aborted";
  }
  if (result.isolation.applied === "worktree") {
    try {
      result.isolation.finalDirtyState = await inspectWorktreeDirtyState(
        result.isolation.worktreePath,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      result.stderr += `\nCould not inspect retained worktree: ${detail}`;
    }
  }
  return result;
}

const TaskItem = Type.Object({
  task: Type.String({ description: "Task for the background pi process" }),
  cwd: Type.Optional(
    Type.String({ description: "Working directory for this task" }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Model for this task. Defaults to current pi settings.",
    }),
  ),
  tools: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Allowed tool names. Managed temporary workspace tools are always added. Defaults to read-only tools.",
    }),
  ),
  readOnly: Type.Optional(
    Type.Boolean({
      description:
        "Use read-only tools by default. Set false to allow edit/write tools.",
      default: true,
    }),
  ),
  isolation: Type.Optional(
    Type.Union([
      Type.Literal("auto"),
      Type.Literal("worktree"),
      Type.Literal("none"),
    ], {
      description:
        "Checkout isolation for write-enabled tasks. Defaults to none. auto and worktree refuse unsafe setup instead of falling back.",
    }),
  ),
});

const SubagentParams = Type.Object({
  task: Type.Optional(
    Type.String({ description: "Task for a single background pi process" }),
  ),
  tasks: Type.Optional(
    Type.Array(TaskItem, { description: "Parallel background tasks. Max 8." }),
  ),
  cwd: Type.Optional(
    Type.String({ description: "Working directory for a single task" }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Model for a single task. Defaults to current pi settings.",
    }),
  ),
  tools: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Allowed tool names for a single task. Managed temporary workspace tools are always added.",
    }),
  ),
  readOnly: Type.Optional(
    Type.Boolean({
      description:
        "Use read-only tools for a single task by default. Set false to allow edits.",
      default: true,
    }),
  ),
  isolation: Type.Optional(
    Type.Union([
      Type.Literal("auto"),
      Type.Literal("worktree"),
      Type.Literal("none"),
    ], {
      description:
        "Checkout isolation for a write-enabled task. Defaults to none.",
    }),
  ),
});

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Run disposable background pi agents with isolated context using `pi -p --no-session`.",
      "For substantial work, use it proactively while the parent orchestrates and synthesizes compact handoffs.",
      "Use it for parallel reconnaissance, independent checks, or focused work that would bloat the main context.",
      "For parallel work, provide `tasks` only. For one background agent, provide `task` only.",
      "No specialized agent names are required. Every spawned process requests xhigh thinking.",
      "Tasks are read-only by default. Set `readOnly: false` or pass explicit `tools` only when edits are intended. Managed temporary workspace tools are always available.",
    ].join(" "),
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const hasParallel = Boolean(params.tasks && params.tasks.length > 0);
      const hasSingle = Boolean(params.task);

      const makeDetails =
        (mode: "single" | "parallel") =>
        (results: RunResult[]): SubagentDetails => ({ mode, results });

      if (!hasSingle && !hasParallel) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid parameters. Provide `task` or `tasks`.",
            },
          ],
          details: makeDetails("single")([]),
          isError: true,
        };
      }

      // Prefer `tasks` if the model accidentally provides both. Some providers fill optional fields too eagerly.
      if (hasParallel) {
        const tasks = params.tasks!;
        if (tasks.length > MAX_PARALLEL_TASKS) {
          return {
            content: [
              {
                type: "text",
                text: `Too many parallel tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
              },
            ],
            details: makeDetails("parallel")([]),
            isError: true,
          };
        }

        const allResults: RunResult[] = tasks.map((task) => ({
          task: task.task,
          cwd: task.cwd ?? ctx.cwd,
          exitCode: -1,
          messages: [],
          stderr: "",
          usage: emptyUsage(),
          model: task.model,
          thinking: "xhigh",
          isolation: {
            requested: task.isolation ?? "none",
            applied: "none",
            reason: task.isolation === "none" ? "explicit-none" : "default",
          },
        }));

        const emitParallelUpdate = () => {
          const running = allResults.filter((r) => r.exitCode === -1).length;
          const done = allResults.length - running;
          onUpdate?.({
            content: [
              {
                type: "text",
                text: `Parallel subagents: ${done}/${allResults.length} done, ${running} running...`,
              },
            ],
            details: makeDetails("parallel")([...allResults]),
          });
        };

        const approvalBroker = await createApprovalBroker(ctx);
        const results = await mapWithConcurrencyLimit(
          tasks,
          MAX_CONCURRENCY,
          async (task, index) => {
            const result = await runPiSubagent(
              ctx.cwd,
              task,
              signal,
              (partial) => {
                if (partial.details?.results[0]) {
                  allResults[index] = partial.details.results[0];
                  emitParallelUpdate();
                }
              },
              makeDetails("parallel"),
              approvalBroker.env,
              {
                sessionId: ctx.sessionManager.getSessionId(),
                taskId: `${_toolCallId}-${index}`,
              },
            );
            allResults[index] = result;
            emitParallelUpdate();
            return result;
          },
        ).finally(() => approvalBroker.close());

        const successCount = results.filter((r) => r.exitCode === 0).length;
        const summaries = results.map((r, i) => {
          const output = getFinalOutput(r.messages).trim();
          const preview =
            output.length > 120 ? `${output.slice(0, 120)}...` : output;
          const isolation = formatIsolation(r);
          return `[${i + 1}] ${r.exitCode === 0 ? "completed" : "failed"}: ${preview || r.errorMessage || r.stderr || "(no output)"}${isolation ? `\n${isolation}` : ""}`;
        });

        return {
          content: [
            {
              type: "text",
              text: `Parallel subagents: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`,
            },
          ],
          details: makeDetails("parallel")(results),
          isError: successCount !== results.length,
        };
      }

      const approvalBroker = await createApprovalBroker(ctx);
      const result = await runPiSubagent(
        ctx.cwd,
        {
          task: params.task!,
          cwd: params.cwd,
          model: params.model,
          tools: params.tools,
          readOnly: params.readOnly,
          isolation: params.isolation,
        },
        signal,
        onUpdate,
        makeDetails("single"),
        approvalBroker.env,
        {
          sessionId: ctx.sessionManager.getSessionId(),
          taskId: _toolCallId,
        },
      ).finally(() => approvalBroker.close());

      const isError =
        result.exitCode !== 0 ||
        result.stopReason === "error" ||
        result.stopReason === "aborted";
      if (isError) {
        const errorMsg =
          result.errorMessage ||
          result.stderr ||
          getFinalOutput(result.messages) ||
          "(no output)";
        return {
          content: [{ type: "text", text: `Subagent failed: ${errorMsg}` }],
          details: makeDetails("single")([result]),
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: getFinalOutput(result.messages) || "(no output)",
          },
        ],
        details: makeDetails("single")([result]),
      };
    },

    renderCall(args, theme, _context) {
      if (args.tasks && args.tasks.length > 0) {
        let text =
          theme.fg("toolTitle", theme.bold("subagents ")) +
          theme.fg("accent", `parallel (${args.tasks.length})`);
        for (const task of args.tasks.slice(0, 3)) {
          const preview =
            task.task.length > 52 ? `${task.task.slice(0, 52)}...` : task.task;
          text += `\n  ${theme.fg("dim", preview)}`;
        }
        if (args.tasks.length > 3)
          text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
        return new Text(text, 0, 0);
      }

      const preview = args.task
        ? args.task.length > 72
          ? `${args.task.slice(0, 72)}...`
          : args.task
        : "...";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("subagent"))}\n  ${theme.fg("dim", preview)}`,
        0,
        0,
      );
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as SubagentDetails | undefined;
      if (!details || details.results.length === 0) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" ? text.text : "(no output)",
          0,
          0,
        );
      }

      const mdTheme = getMarkdownTheme();
      const aggregateUsage = (results: RunResult[]) => {
        const total = emptyUsage();
        for (const r of results) {
          total.input += r.usage.input;
          total.output += r.usage.output;
          total.cacheRead += r.usage.cacheRead;
          total.cacheWrite += r.usage.cacheWrite;
          total.cost += r.usage.cost;
          total.turns += r.usage.turns;
          total.contextTokens += r.usage.contextTokens;
        }
        return total;
      };

      const renderTask = (r: RunResult, index?: number) => {
        const isRunning = r.exitCode === -1;
        const isError =
          r.exitCode > 0 ||
          r.stopReason === "error" ||
          r.stopReason === "aborted";
        const icon = isRunning
          ? theme.fg("warning", "⏳")
          : isError
            ? theme.fg("error", "✗")
            : theme.fg("success", "✓");
        const output =
          getFinalOutput(r.messages).trim() ||
          r.errorMessage ||
          r.stderr ||
          (isRunning ? "(running...)" : "(no output)");
        const title =
          index === undefined ? "subagent" : `subagent ${index + 1}`;
        return {
          icon,
          output,
          title,
          usage: formatUsageStats(r.usage, r.model),
        };
      };

      if (details.mode === "single") {
        const r = details.results[0];
        const task = renderTask(r);
        if (expanded) {
          const container = new Container();
          container.addChild(
            new Text(
              `${task.icon} ${theme.fg("toolTitle", theme.bold(task.title))}`,
              0,
              0,
            ),
          );
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(
              theme.fg("muted", "Task: ") + theme.fg("dim", r.task),
              0,
              0,
            ),
          );
          const displayItems = getDisplayItems(r.messages).filter(
            (item) => item.type === "toolCall",
          );
          for (const item of displayItems) {
            if (item.type === "toolCall")
              container.addChild(
                new Text(theme.fg("muted", `→ ${item.name}`), 0, 0),
              );
          }
          container.addChild(new Spacer(1));
          container.addChild(new Markdown(task.output, 0, 0, mdTheme));
          const isolation = formatIsolation(r);
          if (isolation)
            container.addChild(new Text(theme.fg("warning", isolation), 0, 0));
          if (task.usage)
            container.addChild(new Text(theme.fg("dim", task.usage), 0, 0));
          return container;
        }

        const lines = task.output
          .split("\n")
          .slice(0, COLLAPSED_OUTPUT_LINES)
          .join("\n");
        let text = `${task.icon} ${theme.fg("toolTitle", theme.bold(task.title))}\n${theme.fg("toolOutput", lines)}`;
        if (task.output.split("\n").length > COLLAPSED_OUTPUT_LINES)
          text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        if (task.usage) text += `\n${theme.fg("dim", task.usage)}`;
        return new Text(text, 0, 0);
      }

      const running = details.results.filter((r) => r.exitCode === -1).length;
      const successCount = details.results.filter(
        (r) => r.exitCode === 0,
      ).length;
      const failCount = details.results.filter((r) => r.exitCode > 0).length;
      const icon =
        running > 0
          ? theme.fg("warning", "⏳")
          : failCount > 0
            ? theme.fg("warning", "◐")
            : theme.fg("success", "✓");
      const status =
        running > 0
          ? `${successCount + failCount}/${details.results.length} done, ${running} running`
          : `${successCount}/${details.results.length} succeeded`;

      if (expanded && running === 0) {
        const container = new Container();
        container.addChild(
          new Text(
            `${icon} ${theme.fg("toolTitle", theme.bold("parallel subagents "))}${theme.fg("accent", status)}`,
            0,
            0,
          ),
        );
        for (let i = 0; i < details.results.length; i++) {
          const r = details.results[i];
          const task = renderTask(r, i);
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(`${task.icon} ${theme.fg("accent", task.title)}`, 0, 0),
          );
          container.addChild(
            new Text(
              theme.fg("muted", "Task: ") + theme.fg("dim", r.task),
              0,
              0,
            ),
          );
          container.addChild(new Markdown(task.output, 0, 0, mdTheme));
          const isolation = formatIsolation(r);
          if (isolation)
            container.addChild(new Text(theme.fg("warning", isolation), 0, 0));
          if (task.usage)
            container.addChild(new Text(theme.fg("dim", task.usage), 0, 0));
        }
        const usage = formatUsageStats(aggregateUsage(details.results));
        if (usage) {
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(theme.fg("dim", `Total: ${usage}`), 0, 0),
          );
        }
        return container;
      }

      let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel subagents "))}${theme.fg("accent", status)}`;
      for (let i = 0; i < details.results.length; i++) {
        const task = renderTask(details.results[i], i);
        const firstLines = task.output.split("\n").slice(0, 4).join("\n");
        text += `\n\n${task.icon} ${theme.fg("accent", task.title)}\n${theme.fg("toolOutput", firstLines)}`;
      }
      if (running === 0) {
        const usage = formatUsageStats(aggregateUsage(details.results));
        if (usage) text += `\n\n${theme.fg("dim", `Total: ${usage}`)}`;
      }
      if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
      return new Text(text, 0, 0);
    },
  });
}
