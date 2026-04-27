#!/usr/bin/env node

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

const DEFAULT_CLIPPINGS_DIR = path.join(
  os.homedir(),
  "Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/content/clippings",
)

class ClipError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.exitCode = exitCode
  }
}

function printHelp() {
  console.log(`Usage: clip-article [url] [options]

Clip an article URL to Markdown in your Obsidian clippings folder.

Arguments:
  url                    Article URL. If omitted, prompts interactively.

Options:
  --tags tag1,tag2       Add extra frontmatter tags.
  --output path          Save to a custom directory.
  --title title          Override the article title.
  --print                Print Markdown instead of writing a file.
  --dry-run              Print target path and Markdown without writing.
  -h, --help             Show this help.
`)
}

function parseArgs(argv) {
  const options = {
    tags: [],
    outputDir: DEFAULT_CLIPPINGS_DIR,
    title: undefined,
    print: false,
    dryRun: false,
    help: false,
    url: undefined,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "-h" || arg === "--help") {
      options.help = true
    } else if (arg === "--print") {
      options.print = true
    } else if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--tags") {
      const value = argv[++i]
      if (!value) throw new ClipError("Missing value for --tags")
      options.tags = value.split(",").map((tag) => tag.trim()).filter(Boolean)
    } else if (arg.startsWith("--tags=")) {
      options.tags = arg.slice("--tags=".length).split(",").map((tag) => tag.trim()).filter(Boolean)
    } else if (arg === "--output") {
      const value = argv[++i]
      if (!value) throw new ClipError("Missing value for --output")
      options.outputDir = expandHome(value)
    } else if (arg.startsWith("--output=")) {
      options.outputDir = expandHome(arg.slice("--output=".length))
    } else if (arg === "--title") {
      const value = argv[++i]
      if (!value) throw new ClipError("Missing value for --title")
      options.title = value
    } else if (arg.startsWith("--title=")) {
      options.title = arg.slice("--title=".length)
    } else if (arg.startsWith("-")) {
      throw new ClipError(`Unknown option: ${arg}`)
    } else if (!options.url) {
      options.url = arg
    } else {
      throw new ClipError(`Unexpected argument: ${arg}`)
    }
  }

  return options
}

function expandHome(value) {
  if (value === "~") return os.homedir()
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2))
  return value
}

async function promptForUrl() {
  if (!process.stdin.isTTY) {
    throw new ClipError("Missing URL. Usage: clip-article \"https://example.com/article\"")
  }

  const rl = readline.createInterface({ input, output })

  try {
    return (await rl.question("URL to clip: ")).trim()
  } finally {
    rl.close()
  }
}

function parseUrl(value) {
  if (!value) throw new ClipError("Missing URL")

  let url
  try {
    url = new URL(value)
  } catch {
    throw new ClipError(`Invalid URL: ${value}`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ClipError(`Unsupported URL protocol: ${url.protocol}`)
  }

  return url
}

async function fetchHtml(url) {
  let response
  try {
    response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) clip-article/1.0 Safari/537.36",
      },
    })
  } catch (error) {
    throw new ClipError(`Network failure while fetching ${url}: ${error.message}`)
  }

  if (!response.ok) {
    throw new ClipError(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("html")) {
    throw new ClipError(`Non-HTML response from ${url}: ${contentType || "unknown content type"}`)
  }

  return response.text()
}

function extractArticle(html, url) {
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  dom.window.close()

  if (!article?.content) {
    throw new ClipError("Readability could not extract article content")
  }

  return article
}

function articleToMarkdown(article) {
  const turndown = new TurndownService({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
    bulletListMarker: "-",
  })
  turndown.use(gfm)

  return normalizeMarkdown(turndown.turndown(article.content))
}

function normalizeMarkdown(markdown) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function buildMarkdown({ article, url, title, tags }) {
  const resolvedTitle = title || article.title || "Untitled clipping"
  const frontmatter = [
    "---",
    `title: ${yamlString(resolvedTitle)}`,
    `source: ${yamlString(url)}`,
    article.byline ? `author: ${yamlString(article.byline)}` : undefined,
    article.siteName ? `site: ${yamlString(article.siteName)}` : undefined,
    article.publishedTime ? `published: ${yamlString(article.publishedTime)}` : undefined,
    `clipped: ${yamlString(formatLocalIso(new Date()))}`,
    "tags:",
    ...uniqueTags(["clipping", ...tags]).map((tag) => `  - ${yamlString(tag)}`),
    "---",
  ].filter(Boolean)

  const body = articleToMarkdown(article)

  return `${frontmatter.join("\n")}\n\n# ${escapeMarkdownHeading(resolvedTitle)}\n\n${body}\n`
}

function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absOffsetMinutes = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, "0")
  const offsetRemainder = String(absOffsetMinutes % 60).padStart(2, "0")
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRemainder}`
}

function yamlString(value) {
  return JSON.stringify(String(value))
}

function uniqueTags(tags) {
  return [...new Set(tags.map((tag) => slugifyTag(tag)).filter(Boolean))]
}

function slugifyTag(tag) {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, "-")
}

function escapeMarkdownHeading(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/#/g, "\\#").trim()
}

function filenameFromTitle(title) {
  const filename = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "")

  return filename || fallbackFilename()
}

function fallbackFilename() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "-").slice(0, 15)
  return `clipping-${stamp}`
}

async function uniqueFilePath(dir, baseName) {
  let candidate = path.join(dir, `${baseName}.md`)

  for (let suffix = 2; await pathExists(candidate); suffix++) {
    candidate = path.join(dir, `${baseName}-${suffix}.md`)
  }

  return candidate
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function ensureOutputDir(dir) {
  try {
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) throw new ClipError(`Output path exists but is not a directory: ${dir}`)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    console.error(`Creating clippings directory: ${dir}`)
    await fs.mkdir(dir, { recursive: true })
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  const rawUrl = options.url || (await promptForUrl())
  const url = parseUrl(rawUrl)
  const html = await fetchHtml(url)
  const article = extractArticle(html, url.href)
  const title = options.title || article.title || "Untitled clipping"
  const markdown = buildMarkdown({ article, url: url.href, title, tags: options.tags })
  const baseName = filenameFromTitle(title)
  const outputDir = path.resolve(options.outputDir)
  const filePath = await uniqueFilePath(outputDir, baseName)

  if (options.print) {
    process.stdout.write(markdown)
    return
  }

  if (options.dryRun) {
    console.log(`Would save to: ${filePath}\n`)
    process.stdout.write(markdown)
    return
  }

  await ensureOutputDir(outputDir)

  try {
    await fs.writeFile(filePath, markdown, { flag: "wx" })
  } catch (error) {
    if (error.code === "EACCES" || error.code === "EPERM") {
      throw new ClipError(`Write permission failure for ${filePath}: ${error.message}`)
    }
    throw error
  }

  console.log(`Saved clipping: ${filePath}`)
}

main().catch((error) => {
  if (error instanceof ClipError) {
    console.error(`clip-article: ${error.message}`)
    process.exit(error.exitCode)
  }

  console.error(`clip-article: ${error.message}`)
  process.exit(1)
})
