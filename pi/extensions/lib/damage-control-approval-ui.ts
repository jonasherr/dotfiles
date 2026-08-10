import type { ExtensionContext } from "@mariozechner/pi-coding-agent"
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type TUI,
} from "@mariozechner/pi-tui"

type ApprovalTheme = ExtensionContext["ui"]["theme"]

export type DamageControlApproval = {
  category: string
  matched: string
  subject: string
}

function fitLine(value: string, width: number): string {
  const clipped = truncateToWidth(value, width, "")
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)))
}

class DamageControlApprovalDialog implements Component {
  private scrollOffset = 0
  private selected: "allow" | "block" = "block"
  private pendingG = false
  private cachedWidth?: number
  private cachedLines?: string[]

  constructor(
    private readonly tui: TUI,
    private readonly theme: ApprovalTheme,
    private readonly approval: DamageControlApproval,
    private readonly subagent: boolean,
    private readonly done: (approved: boolean) => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.done(false)
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.done(this.selected === "allow")
      return
    }
    if (
      matchesKey(data, Key.left) ||
      data === "h" ||
      matchesKey(data, Key.right) ||
      data === "l" ||
      matchesKey(data, Key.tab) ||
      matchesKey(data, Key.shift("tab"))
    ) {
      this.pendingG = false
      if (matchesKey(data, Key.left) || data === "h") this.selected = "allow"
      else if (matchesKey(data, Key.right) || data === "l") this.selected = "block"
      else this.selected = this.selected === "allow" ? "block" : "allow"
      this.invalidate()
      this.tui.requestRender()
      return
    }

    const pageSize = Math.max(1, this.maxVisibleLines() - 2)
    if (data === "g") {
      if (this.pendingG) {
        this.pendingG = false
        this.scrollTo(0)
      } else {
        this.pendingG = true
      }
      return
    }

    this.pendingG = false
    if (matchesKey(data, Key.up) || data === "k") this.scrollBy(-1)
    else if (matchesKey(data, Key.down) || data === "j") this.scrollBy(1)
    else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
      this.scrollBy(-pageSize)
    } else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
      this.scrollBy(pageSize)
    } else if (matchesKey(data, Key.home)) this.scrollTo(0)
    else if (matchesKey(data, Key.end) || data === "G") {
      this.scrollTo(Number.MAX_SAFE_INTEGER)
    }
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedLines) return this.cachedLines

    const innerWidth = Math.max(1, width - 4)
    const content = this.contentLines(innerWidth)
    const visibleCount = this.maxVisibleLines()
    const maxOffset = Math.max(0, content.length - visibleCount)
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset)
    const visible = content.slice(this.scrollOffset, this.scrollOffset + visibleCount)
    const above = this.scrollOffset
    const below = Math.max(0, content.length - this.scrollOffset - visible.length)
    const border = (value: string) => this.theme.fg("borderAccent", value)
    const title = this.theme.fg("warning", this.theme.bold(" Damage Control "))
    const titleWidth = visibleWidth(title)
    const topFill = Math.max(0, width - titleWidth - 2)
    const lines = [border("╭") + title + border(`${"─".repeat(topFill)}╮`)]

    const scrollStatus =
      above || below
        ? this.theme.fg("dim", ` ${above} above, ${below} below `)
        : ""
    lines.push(
      border("│ ") + fitLine(scrollStatus, innerWidth) + border(" │"),
    )
    for (const line of visible) {
      lines.push(border("│ ") + fitLine(line, innerWidth) + border(" │"))
    }

    const allow =
      this.selected === "allow"
        ? this.theme.bg("selectedBg", this.theme.bold(" Allow "))
        : this.theme.fg("muted", " Allow ")
    const block =
      this.selected === "block"
        ? this.theme.bg("selectedBg", this.theme.bold(" Block "))
        : this.theme.fg("muted", " Block ")
    const controls = `${allow}  ${block}`
    lines.push(border("├") + border("─".repeat(Math.max(0, width - 2))) + border("┤"))
    lines.push(border("│ ") + fitLine(controls, innerWidth) + border(" │"))
    lines.push(
      border("│ ") +
        fitLine(
          this.theme.fg(
            "dim",
            "j/k scroll · Ctrl+u/d page · gg/G ends · h/l select · Enter confirm · Esc block",
          ),
          innerWidth,
        ) +
        border(" │"),
    )
    lines.push(border("╰") + border("─".repeat(Math.max(0, width - 2))) + border("╯"))

    this.cachedWidth = width
    this.cachedLines = lines
    return lines
  }

  invalidate(): void {
    this.cachedWidth = undefined
    this.cachedLines = undefined
  }

  private contentLines(width: number): string[] {
    const scope = this.subagent ? " in a subagent" : ""
    return [
      ...wrapTextWithAnsi(
        this.theme.fg(
          "warning",
          `${this.approval.category} matched damage-control rules${scope}.`,
        ),
        width,
      ),
      "",
      this.theme.fg("muted", "Tool call"),
      ...wrapTextWithAnsi(this.approval.subject, width),
      "",
      this.theme.fg("muted", "Matched rule"),
      ...wrapTextWithAnsi(this.approval.matched, width),
    ]
  }

  private maxVisibleLines(): number {
    return Math.max(3, this.tui.terminal.rows - 8)
  }

  private scrollBy(delta: number): void {
    this.scrollTo(this.scrollOffset + delta)
  }

  private scrollTo(offset: number): void {
    this.scrollOffset = Math.max(0, offset)
    this.invalidate()
    this.tui.requestRender()
  }
}

export async function requestDamageControlApproval(
  ctx: ExtensionContext,
  approval: DamageControlApproval,
  subagent = false,
): Promise<boolean> {
  if (ctx.mode !== "tui") {
    const message = [
      `${approval.category} matched damage-control rules${subagent ? " in a subagent" : ""}.`,
      "",
      approval.subject,
      "",
      `Matched: ${approval.matched}`,
      "",
      `Allow this ${subagent ? "subagent " : ""}tool call?`,
    ].join("\n")
    return ctx.ui.confirm("⚠️ Damage Control", message)
  }

  return ctx.ui.custom<boolean>((tui, theme, _keybindings, done) =>
    new DamageControlApprovalDialog(tui, theme, approval, subagent, done),
  )
}
