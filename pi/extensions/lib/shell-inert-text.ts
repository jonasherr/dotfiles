// Best-effort bash parser used to tell executed shell code apart from inert
// text such as search patterns, commit messages, comments, and heredoc
// documents. Parsing is conservative: whenever the command cannot be modeled
// confidently, callers receive the original text so pattern checks fail closed.

export type ShellWord = {
  /** Unquoted value (best effort; substitutions are kept verbatim). */
  value: string
  start: number
  end: number
  quoted: boolean
  /** Contains command or process substitution, so its content executes. */
  dynamic: boolean
}

export type ShellRedirect = {
  operator: string
  target?: ShellWord
}

export type ShellHeredoc = {
  delimiter: string
  quoted: boolean
  stripTabs: boolean
  bodyStart: number
  bodyEnd: number
  terminated: boolean
}

export type ShellSegment = {
  words: ShellWord[]
  redirects: ShellRedirect[]
  heredocs: ShellHeredoc[]
  operatorBefore: string
  operatorAfter: string
}

export type ParsedShell = {
  /** Command with escaped newlines removed, as bash does before parsing. */
  source: string
  segments: ShellSegment[]
  comments: Array<[number, number]>
  confident: boolean
  /** A subshell or brace group feeds a pipe, so pipeline analysis is unreliable. */
  groupPiped: boolean
}

function findBacktickEnd(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1
      continue
    }
    if (source[index] === "`") return index
  }
  return -1
}

function findSingleQuoteEnd(source: string, start: number): number {
  return source.indexOf("'", start + 1)
}

function findDoubleQuoteEnd(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]
    if (char === "\\") {
      index += 1
      continue
    }
    if (char === '"') return index
    if (char === "`") {
      const end = findBacktickEnd(source, index)
      if (end < 0) return -1
      index = end
      continue
    }
    if (char === "$" && (source[index + 1] === "(" || source[index + 1] === "{")) {
      const end = findGroupEnd(source, index + 1)
      if (end < 0) return -1
      index = end
    }
  }
  return -1
}

/** Finds the bracket matching `source[open]` (`(` or `{`), skipping quoted text. */
function findGroupEnd(source: string, open: number): number {
  const opening = source[open]
  const closing = opening === "(" ? ")" : "}"
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    if (char === "\\") {
      index += 1
      continue
    }
    if (char === "'") {
      const end = findSingleQuoteEnd(source, index)
      if (end < 0) return -1
      index = end
      continue
    }
    if (char === '"') {
      const end = findDoubleQuoteEnd(source, index)
      if (end < 0) return -1
      index = end
      continue
    }
    if (char === "`") {
      const end = findBacktickEnd(source, index)
      if (end < 0) return -1
      index = end
      continue
    }
    if (char === opening) depth += 1
    if (char === closing) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Parses a bash command into simple-command segments with word positions. */
export function parseShell(command: string): ParsedShell {
  const source = command.replace(/\\\r?\n/g, "")
  const segments: ShellSegment[] = []
  const comments: Array<[number, number]> = []
  let confident = true
  let groupPiped = false
  let words: ShellWord[] = []
  let redirects: ShellRedirect[] = []
  let heredocs: ShellHeredoc[] = []
  let pendingHeredocs: ShellHeredoc[] = []
  let operatorBefore = ""
  let word: Omit<ShellWord, "end"> | undefined
  let pendingRedirect: ShellRedirect | undefined

  const startWord = (index: number) => {
    if (!word) word = { value: "", start: index, quoted: false, dynamic: false }
    return word
  }
  const finishWord = (end: number) => {
    if (!word) return
    const finished: ShellWord = { ...word, end }
    word = undefined
    if (!pendingRedirect) {
      words.push(finished)
      return
    }
    pendingRedirect.target = finished
    const operator = pendingRedirect.operator
    const isHeredoc = !operator.endsWith("<<<") && (operator.endsWith("<<") || operator.endsWith("<<-"))
    if (isHeredoc) {
      const heredoc: ShellHeredoc = {
        delimiter: finished.value,
        quoted: finished.quoted,
        stripTabs: operator.endsWith("<<-"),
        bodyStart: -1,
        bodyEnd: -1,
        terminated: false,
      }
      heredocs.push(heredoc)
      pendingHeredocs.push(heredoc)
    }
    pendingRedirect = undefined
  }
  const finishSegment = (operatorAfter: string) => {
    if (pendingRedirect) {
      confident = false
      pendingRedirect = undefined
    }
    // `( ... ) | cmd` or `{ ...; } 2>&1 | cmd` pipes a whole group.
    const pipes = operatorAfter.startsWith("|") && operatorAfter !== "||"
    if (pipes && words.length === 0 && [")", "}"].includes(operatorBefore)) groupPiped = true
    if (words.length > 0 || redirects.length > 0) {
      segments.push({ words, redirects, heredocs, operatorBefore, operatorAfter })
    }
    words = []
    redirects = []
    heredocs = []
    operatorBefore = operatorAfter
  }
  const consumeHeredocBodies = (start: number) => {
    let lineStart = start
    for (const heredoc of pendingHeredocs) {
      heredoc.bodyStart = lineStart
      while (lineStart < source.length) {
        const newline = source.indexOf("\n", lineStart)
        const lineEnd = newline < 0 ? source.length : newline
        let line = source.slice(lineStart, lineEnd).replace(/\r$/, "")
        if (heredoc.stripTabs) line = line.replace(/^\t+/, "")
        if (line === heredoc.delimiter) {
          heredoc.bodyEnd = lineStart
          heredoc.terminated = true
          lineStart = newline < 0 ? source.length : newline + 1
          break
        }
        lineStart = newline < 0 ? source.length : newline + 1
      }
      if (!heredoc.terminated) {
        heredoc.bodyEnd = source.length
        confident = false
      }
    }
    pendingHeredocs = []
    return lineStart
  }
  // Appends a quoted or substituted span to the current word.
  const appendSpan = (index: number, end: number, value: string, options: { quoted?: boolean; dynamic?: boolean }) => {
    const current = startWord(index)
    current.value += value
    if (options.quoted) current.quoted = true
    if (options.dynamic) current.dynamic = true
    return end + 1
  }

  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === "\n") {
      finishWord(index)
      finishSegment("\n")
      index = pendingHeredocs.length > 0 ? consumeHeredocBodies(index + 1) : index + 1
      continue
    }
    if (char === " " || char === "\t" || char === "\r") {
      finishWord(index)
      index += 1
      continue
    }
    if (char === "#" && !word) {
      const newline = source.indexOf("\n", index)
      const end = newline < 0 ? source.length : newline
      comments.push([index, end])
      index = end
      continue
    }
    if (char === "\\") {
      const current = startWord(index)
      current.quoted = true
      current.value += next ?? ""
      index += 2
      continue
    }
    if (char === "'") {
      const end = findSingleQuoteEnd(source, index)
      if (end < 0) {
        confident = false
        break
      }
      index = appendSpan(index, end, source.slice(index + 1, end), { quoted: true })
      continue
    }
    if (char === '"') {
      const end = findDoubleQuoteEnd(source, index)
      if (end < 0) {
        confident = false
        break
      }
      const content = source.slice(index + 1, end)
      const value = content.replace(/\\([$`"\\])/g, "$1")
      index = appendSpan(index, end, value, { quoted: true, dynamic: /\$\(|`/.test(content) })
      continue
    }
    if (char === "`") {
      const end = findBacktickEnd(source, index)
      if (end < 0) {
        confident = false
        break
      }
      index = appendSpan(index, end, source.slice(index, end + 1), { dynamic: true })
      continue
    }
    if (char === "$" && (next === "(" || next === "{")) {
      const end = findGroupEnd(source, index + 1)
      if (end < 0) {
        confident = false
        break
      }
      const text = source.slice(index, end + 1)
      index = appendSpan(index, end, text, { dynamic: next === "(" || /\$\(|`/.test(text) })
      continue
    }
    if ((char === "<" || char === ">") && next === "(") {
      const end = findGroupEnd(source, index + 1)
      if (end < 0) {
        confident = false
        break
      }
      index = appendSpan(index, end, source.slice(index, end + 1), { dynamic: true })
      continue
    }
    if (char === "<" || char === ">" || (char === "&" && next === ">")) {
      let operator = ""
      if (word && !word.quoted && /^\d+$/.test(word.value) && word.start + word.value.length === index) {
        operator = word.value
        word = undefined
      } else {
        finishWord(index)
      }
      const match = source.slice(index).match(/^(?:&>>|&>|<<<|<<-|<<|<>|<&|>>|>&|>\||<|>)/)
      const symbol = match?.[0] ?? char
      operator += symbol
      index += symbol.length
      if (symbol.endsWith("&")) {
        const duplicate = source.slice(index).match(/^(?:\d+|-)/)
        if (duplicate) {
          redirects.push({ operator: operator + duplicate[0] })
          index += duplicate[0].length
          continue
        }
      }
      const redirect: ShellRedirect = { operator }
      redirects.push(redirect)
      pendingRedirect = redirect
      continue
    }
    if (char === "|" || char === "&" || char === ";") {
      finishWord(index)
      const match = source.slice(index).match(/^(?:\|\||\|&|&&|;;&|;;|;&|\||&|;)/)
      const operator = match?.[0] ?? char
      finishSegment(operator)
      index += operator.length
      continue
    }
    // `)` always ends a word; `(` does too except in array assignments (`a=(x y)`).
    if (char === ")" || (char === "(" && !word?.value.endsWith("="))) {
      finishWord(index)
      finishSegment(char)
      index += 1
      continue
    }
    const standalone = next === undefined || /[\s;&|]/.test(next)
    if ((char === "{" || char === "}") && !word && words.length === 0 && standalone) {
      finishSegment(char)
      index += 1
      continue
    }
    startWord(index).value += char
    index += 1
  }

  finishWord(source.length)
  finishSegment("")
  if (pendingHeredocs.length > 0) confident = false
  return { source, segments, comments, confident, groupPiped }
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

export function executableName(value: string | undefined): string {
  return (value ?? "").split("/").pop() ?? ""
}

/** Index of the word that is actually executed, after assignments and wrappers. */
export function commandWordIndex(words: readonly ShellWord[]): number {
  let index = 0
  while (index < words.length) {
    const value = words[index].value
    const name = executableName(value)
    if (ASSIGNMENT.test(value) || ["!", "if", "then", "do", "else", "elif", "while", "until", "nohup", "builtin"].includes(value)) {
      index += 1
      continue
    }
    if (name === "env") {
      index += 1
      while (words[index] && (words[index].value.startsWith("-") || ASSIGNMENT.test(words[index].value))) index += 1
      continue
    }
    if (name === "command" && !["-v", "-V"].includes(words[index + 1]?.value ?? "")) {
      index += 1
      continue
    }
    if (name === "time") {
      index += words[index + 1]?.value === "-p" ? 2 : 1
      continue
    }
    if (name === "nice") {
      index += words[index + 1]?.value === "-n" ? 3 : 1
      continue
    }
    if (name === "timeout") {
      index += 1
      while (words[index]?.value.startsWith("-")) index += 1
      index += 1
      continue
    }
    if (name === "sudo" || name === "doas") {
      index += 1
      while (words[index]?.value.startsWith("-")) {
        index += ["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"].includes(words[index].value) ? 2 : 1
      }
      continue
    }
    break
  }
  return index
}

// Commands that run scripts or code. If one appears anywhere in the command,
// text written by an earlier segment might be executed, so nothing is masked.
const SCRIPT_RUNNERS = new Set([
  ".", "bash", "bun", "deno", "dash", "eval", "exec", "fish", "ksh", "node", "osascript", "perl",
  "php", "pwsh", "python", "python3", "ruby", "sh", "source", "ts-node", "tsx", "zsh",
])

// Commands that only read stdin as data and never execute it.
const STDIN_DATA_CONSUMERS = new Set([
  "base64", "bat", "cat", "column", "comm", "cut", "diff", "egrep", "fgrep", "fold", "grep", "head",
  "hexdump", "jq", "less", "md5", "md5sum", "more", "nl", "od", "pbcopy", "rev", "rg", "sha256sum",
  "shasum", "sort", "strings", "tail", "tee", "tr", "uniq", "wc", "xxd",
])

// Commands whose arguments are plain text (patterns, messages, strings).
const TEXT_ARGUMENT_COMMANDS = new Set(["[", "[[", "echo", "egrep", "fgrep", "grep", "jq", "printf", "rg", "test", "ag", "ack"])

// Git options whose values are free text, per subcommand.
const GIT_MESSAGE_OPTIONS = ["-m", "--message"]
const GIT_LOG_TEXT_OPTIONS = ["--grep", "-S", "-G", "--format", "--pretty", "--author", "--committer"]
const GIT_TEXT_OPTIONS: Record<string, readonly string[]> = {
  commit: GIT_MESSAGE_OPTIONS,
  merge: GIT_MESSAGE_OPTIONS,
  notes: GIT_MESSAGE_OPTIONS,
  stash: GIT_MESSAGE_OPTIONS,
  tag: GIT_MESSAGE_OPTIONS,
  log: GIT_LOG_TEXT_OPTIONS,
  show: GIT_LOG_TEXT_OPTIONS,
  shortlog: GIT_LOG_TEXT_OPTIONS,
  whatchanged: GIT_LOG_TEXT_OPTIONS,
  "rev-list": GIT_LOG_TEXT_OPTIONS,
  "for-each-ref": ["--format"],
  grep: ["-e"],
}
// Git subcommands that can execute user-supplied commands.
const GIT_EXECUTING_SUBCOMMANDS = new Set(["bisect", "config", "difftool", "filter-branch", "filter-repo", "mergetool", "rebase", "submodule"])
const GH_TEXT_OPTIONS = new Set(["--body", "-b", "--title", "-t", "--jq", "-q", "--template", "--notes", "-n", "--message", "-m"])

function segmentRunsScripts(segment: ShellSegment): boolean {
  const index = commandWordIndex(segment.words)
  const value = segment.words[index]?.value ?? ""
  const name = executableName(value)
  if (SCRIPT_RUNNERS.has(name)) return true
  // Path executables such as ./cleanup.sh may run a script written earlier.
  return value.includes("/") && !["git", "rg", "grep", "cat", "ls", "echo", "printf"].includes(name)
}

function gitTextWordIndexes(words: readonly ShellWord[], commandIndex: number): number[] {
  let index = commandIndex + 1
  while (index < words.length && words[index].value.startsWith("-")) {
    const option = words[index].value
    // Inline configuration can define aliases or hooks that run commands.
    if (option === "-c" || option.startsWith("-c") || option.startsWith("--config-env")) return []
    index += ["-C", "--git-dir", "--work-tree", "--namespace"].includes(option) ? 2 : 1
  }
  const subcommand = words[index]?.value
  if (!subcommand || GIT_EXECUTING_SUBCOMMANDS.has(subcommand)) return []
  const args = words.slice(index + 1)
  if (args.some(({ value }) => value === "-x" || value === "--exec" || value.startsWith("--exec="))) return []

  const textOptions = GIT_TEXT_OPTIONS[subcommand] ?? []
  const result: number[] = []
  let patternSeen = false
  for (let offset = 0; offset < args.length; offset += 1) {
    const value = args[offset].value
    const position = index + 1 + offset
    const [name] = value.split("=", 1)
    if (textOptions.includes(value) && offset + 1 < args.length) {
      result.push(position + 1)
      offset += 1
      continue
    }
    if (value.includes("=") && textOptions.includes(name)) {
      result.push(position)
      continue
    }
    if (textOptions.includes("-m") && /^-m./.test(value)) {
      result.push(position)
      continue
    }
    // `git grep PATTERN`: the first positional is the pattern.
    if (subcommand === "grep" && !patternSeen && !value.startsWith("-") && !args.some(({ value: arg }) => arg === "-e" || arg === "-f")) {
      patternSeen = true
      result.push(position)
    }
  }
  return result
}

function textWordIndexes(segment: ShellSegment): number[] {
  const { words } = segment
  const commandIndex = commandWordIndex(words)
  const name = executableName(words[commandIndex]?.value)
  const after = words.map((_, index) => index).filter((index) => index > commandIndex)

  if (TEXT_ARGUMENT_COMMANDS.has(name)) {
    // `rg --pre COMMAND` runs a preprocessor for every file.
    if (name === "rg" && words.some(({ value }) => value === "--pre" || value.startsWith("--pre="))) return []
    return after
  }
  if (name === "git") return gitTextWordIndexes(words, commandIndex)
  if (name === "gh") {
    return after.filter((index) => words[index].quoted || GH_TEXT_OPTIONS.has(words[index - 1]?.value ?? ""))
  }
  return []
}

function consumesStdinAsData(segment: ShellSegment): boolean {
  const name = executableName(segment.words[commandWordIndex(segment.words)]?.value)
  return STDIN_DATA_CONSUMERS.has(name) || name === "git" || name === "gh"
}

function pipelines(segments: readonly ShellSegment[]): ShellSegment[][] {
  const result: ShellSegment[][] = []
  for (const segment of segments) {
    const piped = segment.operatorBefore.startsWith("|") && segment.operatorBefore !== "||"
    if (piped && result.length > 0) result[result.length - 1].push(segment)
    else result.push([segment])
  }
  return result
}

/**
 * Replaces inert text with empty strings so destructive-command patterns only
 * see executed shell code. Masked: comments, text arguments of commands such
 * as `rg`, `echo`, `git commit -m`, and heredoc documents fed to data readers
 * such as `cat > file`. Substitutions, redirect targets, and anything that
 * flows into a command that may execute it are never masked.
 */
export function maskInertShellText(command: string): string {
  const parsed = parseShell(command)
  if (!parsed.confident) return command

  const replacements: Array<[number, number, string]> = parsed.comments.map(([start, end]) => [start, end, ""])
  const maskText = !parsed.groupPiped && !parsed.segments.some(segmentRunsScripts)
  if (maskText) {
    for (const pipeline of pipelines(parsed.segments)) {
      pipeline.forEach((segment, position) => {
        // Output flowing into anything but a data reader might be executed.
        if (!pipeline.slice(position + 1).every(consumesStdinAsData)) return
        for (const index of textWordIndexes(segment)) {
          const word = segment.words[index]
          if (!word.dynamic) replacements.push([word.start, word.end, "''"])
        }
        if (!consumesStdinAsData(segment)) return
        for (const heredoc of segment.heredocs) {
          const body = parsed.source.slice(heredoc.bodyStart, heredoc.bodyEnd)
          // Unquoted heredocs expand $(...) and backticks.
          if (heredoc.terminated && (heredoc.quoted || !/\$\(|`/.test(body))) {
            replacements.push([heredoc.bodyStart, heredoc.bodyEnd, ""])
          }
        }
        for (const redirect of segment.redirects) {
          if (redirect.operator.endsWith("<<<") && redirect.target && !redirect.target.dynamic) {
            replacements.push([redirect.target.start, redirect.target.end, "''"])
          }
        }
      })
    }
  }

  let result = parsed.source
  let lastStart = Number.POSITIVE_INFINITY
  for (const [start, end, replacement] of replacements.sort((left, right) => right[0] - left[0])) {
    if (end > lastStart) continue
    result = result.slice(0, start) + replacement + result.slice(end)
    lastStart = start
  }
  return result
}
