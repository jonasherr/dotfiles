import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"

import {
  createPapercutsHandler,
  createPapercutsParameters,
  formatPapercutEntry,
  papercutsConstants,
  redactCredentials,
} from "./papercuts.ts"

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "papercuts-test-"))
  t.after(() => rm(home, { recursive: true, force: true }))
  const path = join(home, papercutsConstants.relativePath)
  const execute = createPapercutsHandler({
    homedir: () => home,
    now: () => new Date("2026-07-09T02:05:18.605Z"),
  })
  return { execute, path }
}

test("appends the minimal entry with UTC timestamp, cwd, and session ID", async (t) => {
  const { execute, path } = await fixture(t)

  const result = await execute(
    { description: "The test command resolved paths from a nested workspace." },
    new AbortController().signal,
    "/path/to/project",
    "session-123",
  )

  assert.equal(result.content[0].text, "Papercut logged.")
  assert.equal(result.details.path, path)
  assert.equal(
    await readFile(path, "utf8"),
    "## 2026-07-09T02:05:18.605Z\n\n" +
      "**Path:** `/path/to/project`  \n" +
      "**Session:** `session-123`\n\n" +
      "The test command resolved paths from a nested workspace.\n",
  )
})

test("omits a missing session ID and separates append-only entries", async (t) => {
  const { execute, path } = await fixture(t)
  const signal = new AbortController().signal

  await execute({ description: "First annoyance." }, signal, "/repo")
  await execute({ description: "Second annoyance." }, signal, "/repo")

  const diary = await readFile(path, "utf8")
  assert.equal((diary.match(/^## /gm) ?? []).length, 2)
  assert.doesNotMatch(diary, /\*\*Session:/)
  assert.match(diary, /First annoyance\.\n\n## /)
  assert.ok(diary.endsWith("Second annoyance.\n"))
})

test("redacts simple credentials without including raw values", () => {
  const privateKey = [
    "-----BEGIN PRIVATE KEY-----",
    "super-secret-material",
    "-----END PRIVATE KEY-----",
  ].join("\n")
  const input = [
    "Authorization: Bearer secret-token",
    "password=hunter2",
    "api_key: 'top-secret'",
    "token sk-1234567890abcdefghijklmnop",
    "aws AKIAIOSFODNN7EXAMPLE",
    "google AIzaSy1234567890abcdefghijklmnop",
    "gitlab glpat-1234567890abcdefghijkl",
    "jwt eyJabc.eyJdef.signature123",
    privateKey,
  ].join("\n")

  const redacted = redactCredentials(input)
  for (const secret of [
    "secret-token",
    "hunter2",
    "top-secret",
    "sk-1234567890abcdefghijklmnop",
    "AKIAIOSFODNN7EXAMPLE",
    "AIzaSy1234567890abcdefghijklmnop",
    "glpat-1234567890abcdefghijkl",
    "eyJabc.eyJdef.signature123",
    "super-secret-material",
  ]) {
    assert.doesNotMatch(redacted, new RegExp(secret))
  }
  assert.match(redacted, /Authorization: \[REDACTED\]/)
  assert.match(redacted, /password=\[REDACTED\]/)
  assert.match(redacted, /\[REDACTED PRIVATE KEY\]/)
})

test("redacts credentials in the persisted diary", async (t) => {
  const { execute, path } = await fixture(t)

  await execute(
    { description: "The docs exposed password=hunter2 in an example." },
    new AbortController().signal,
    "/repo",
  )

  const diary = await readFile(path, "utf8")
  assert.doesNotMatch(diary, /hunter2/)
  assert.match(diary, /password=\[REDACTED\]/)
})

test("escapes metadata and description headings that could forge entries", () => {
  const entry = formatPapercutEntry({
    timestamp: new Date("2026-07-09T02:05:18.605Z"),
    cwd: "/repo/`odd`\npath",
    sessionId: "session`id\nnext",
    description: "Annoying but safe.\n\n## forged entry",
  })

  assert.match(entry, /\*\*Path:\*\* `\/repo\/\\`odd\\` path`/)
  assert.match(entry, /\*\*Session:\*\* `session\\`id next`/)
  assert.match(entry, /\\## forged entry/)
  assert.equal((entry.match(/^## /gm) ?? []).length, 1)
})

test("rejects empty descriptions, cancellation, and write failures", async () => {
  const signal = new AbortController().signal
  const execute = createPapercutsHandler({ homedir: () => "/unused" })
  await assert.rejects(
    execute({ description: "  " }, signal, "/repo"),
    /papercuts failed: description must not be empty/,
  )

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    execute({ description: "Annoyance." }, controller.signal, "/repo"),
    /papercuts failed: operation cancelled/,
  )

  const failing = createPapercutsHandler({
    homedir: () => "/unused",
    mkdir: async () => undefined,
    fileSize: async () => 0,
    appendFile: async () => {
      throw new Error("disk is read-only")
    },
  })
  await assert.rejects(
    failing({ description: "Annoyance." }, signal, "/repo"),
    /papercuts failed: disk is read-only/,
  )
})

test("exposes one required description in a closed schema", () => {
  const Type = {
    String: (options = {}) => ({ type: "string", ...options }),
    Object: (properties, options = {}) => ({
      type: "object",
      properties,
      required: Object.keys(properties),
      ...options,
    }),
  }
  const schema = createPapercutsParameters(Type) as any

  assert.equal(schema.type, "object")
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, ["description"])
  assert.deepEqual(Object.keys(schema.properties), ["description"])
  assert.equal(schema.properties.description.type, "string")
  assert.equal(schema.properties.description.minLength, 1)
})
