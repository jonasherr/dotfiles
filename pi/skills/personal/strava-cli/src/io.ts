import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { CliOptions, JsonValue } from "./types.js"

export function printHuman(message: string, options: CliOptions): void {
  if (!options.json) console.log(message)
}

export async function writeOutput(data: string | JsonValue, options: CliOptions): Promise<void> {
  const content = typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`

  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true })
    await writeFile(options.out, content, "utf8")
    if (!options.json) console.log(`Wrote ${options.out}`)
    return
  }

  if (typeof data === "string") {
    process.stdout.write(data)
  } else {
    console.log(JSON.stringify(data, null, options.json ? 0 : 2))
  }
}

export function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback
  return ["1", "true", "yes", "y"].includes(value.toLowerCase())
}
