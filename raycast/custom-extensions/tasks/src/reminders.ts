import { environment } from "@raycast/api";
import { chmod } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

export type Priority = "low" | "medium" | "high" | null;

export type ReminderList = {
  id: string;
  title: string;
  color: string;
  isDefault: boolean;
};

export type Reminder = {
  id: string;
  openUrl: string;
  attachedUrls?: string[];
  title: string;
  notes: string;
  dueDate: string | null;
  isCompleted: boolean;
  priority: Priority;
  completionDate: string;
  isRecurring: boolean;
  recurrenceRule: string;
  list: ReminderList | null;
  location?: {
    address: string;
    proximity: string;
    radius?: number;
  };
  creationDate?: number | Date;
  hashtags?: string[];
};

export type RemindersData = {
  reminders: Reminder[];
  lists: ReminderList[];
};

export class SwiftError extends Error {
  stdout?: string;
  stderr?: string;

  constructor(message: string) {
    super(message);
    this.name = "SwiftError";
  }
}

async function runSwiftFunction<T>(
  command: string,
  ...args: unknown[]
): Promise<T> {
  return runHelperFunction<T>("AppleReminders", command, ...args);
}

async function runNativeTagsFunction<T>(
  command: string,
  ...args: unknown[]
): Promise<T> {
  return runHelperFunction<T>("AppleRemindersNativeTags", command, ...args);
}

async function runHelperFunction<T>(
  helperName: string,
  command: string,
  ...args: unknown[]
): Promise<T> {
  if (process.platform === "win32") {
    return Promise.reject(
      new Error("Swift functions are not supported on Windows"),
    );
  }

  const swiftPath = join(
    environment.assetsPath,
    "compiled_raycast_swift",
    helperName,
  );
  await chmod(swiftPath, "755");

  return new Promise((resolve, reject) => {
    const commandArgs = [command];
    for (const arg of args) {
      try {
        commandArgs.push(
          JSON.stringify(arg, (_key, value) =>
            value === undefined ? null : value,
          ),
        );
      } catch (error) {
        reject(
          new SwiftError(
            `Failed to serialize input to JSON: ${error instanceof Error ? error.message : error}`,
          ),
        );
        return;
      }
    }

    const child = spawn(swiftPath, commandArgs);
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout?.on("data", (data) => stdout.push(data.toString()));
    child.stderr?.on("data", (data) => stderr.push(data.toString()));

    child.on("exit", (code) => {
      const stdoutText = stdout.join("").trim();
      const stderrText = stderr.join("").trim();

      if (code === 0) {
        try {
          resolve(
            stdoutText.length ? (JSON.parse(stdoutText) as T) : (null as T),
          );
        } catch (error) {
          const swiftError = new SwiftError(
            `Failed to deserialize result from JSON: ${error instanceof Error ? error.message : error}`,
          );
          swiftError.stdout = stdoutText;
          swiftError.stderr = stderrText;
          reject(swiftError);
        }
      } else {
        const swiftError = new SwiftError(
          stderrText || stdoutText || "Could not get any data",
        );
        swiftError.stdout = stdoutText;
        swiftError.stderr = stderrText;
        reject(swiftError);
      }
    });

    child.on("error", reject);
  });
}

export async function getData(): Promise<RemindersData> {
  try {
    return await runNativeTagsFunction<RemindersData>("getData");
  } catch (error) {
    console.error("Native Reminders tag helper failed, falling back", error);
    return runSwiftFunction<RemindersData>("getData");
  }
}

export async function getReminderTags(payload: {
  reminderId: string;
}): Promise<{ reminderId: string; hashtags: string[] }> {
  return runNativeTagsFunction("getReminderTags", payload);
}

export async function addTag(payload: {
  reminderId: string;
  tag: string;
}): Promise<{ reminder: Reminder }> {
  return runNativeTagsFunction("addTag", payload);
}

export async function removeTag(payload: {
  reminderId: string;
  tag: string;
}): Promise<{ reminder: Reminder }> {
  return runNativeTagsFunction("removeTag", payload);
}

export async function setTags(payload: {
  reminderId: string;
  tags: string[];
}): Promise<{ reminder: Reminder }> {
  return runNativeTagsFunction("setTags", payload);
}

export async function setTitleAndNotes(payload: {
  reminderId: string;
  title: string;
  notes: string;
}): Promise<unknown> {
  return runSwiftFunction("setTitleAndNotes", payload);
}

export async function toggleCompletionStatus(
  reminderId: string,
): Promise<unknown> {
  return runSwiftFunction("toggleCompletionStatus", reminderId);
}

export async function setDueDate(payload: {
  reminderId: string;
  dueDate: string | null;
}): Promise<unknown> {
  return runSwiftFunction("setDueDate", payload);
}
