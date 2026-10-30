import type { DagNodeState, DagRunStatus } from "@oh-my-opencode/senpi-task/dag"

export type ThemeColor =
  | "pending"
  | "blocked"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "title"
  | "muted"
  | "accent"
  | "ok"
  | "warn"
  | "error"
  | "border"

export type Theme = {
  readonly color: boolean
  readonly ascii: boolean
  readonly paint: (color: ThemeColor, text: string) => string
  readonly bold: (text: string) => string
  readonly dim: (text: string) => string
  readonly inverse: (text: string) => string
  readonly stateGlyph: (state: DagNodeState) => string
  readonly runGlyph: (status: DagRunStatus | string) => string
  readonly spinner: (frame: number) => string
}

export type ThemeOptions = {
  readonly color?: boolean
  readonly ascii?: boolean
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly isTTY?: boolean
}

const RESET = "\u001b[0m"
const BOLD = "\u001b[1m"
const DIM = "\u001b[2m"
const INVERSE = "\u001b[7m"

const ANSI_COLORS: Readonly<Record<ThemeColor, string>> = {
  pending: "\u001b[90m",
  blocked: "\u001b[90m",
  scheduled: "\u001b[36m",
  running: "\u001b[33m",
  paused: "\u001b[35m",
  completed: "\u001b[32m",
  failed: "\u001b[31m",
  cancelled: "\u001b[90m",
  skipped: "\u001b[90m",
  title: "\u001b[97m",
  muted: "\u001b[90m",
  accent: "\u001b[36m",
  ok: "\u001b[32m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
  border: "\u001b[90m",
}

const UNICODE_STATE_GLYPHS: Readonly<Record<DagNodeState, string>> = {
  pending: "·",
  blocked: "◌",
  scheduled: "○",
  running: "◐",
  paused: "Ⅱ",
  completed: "✓",
  failed: "✗",
  cancelled: "⊘",
  skipped: "»",
}

const ASCII_STATE_GLYPHS: Readonly<Record<DagNodeState, string>> = {
  pending: ".",
  blocked: "o",
  scheduled: "O",
  running: "*",
  paused: "||",
  completed: "v",
  failed: "x",
  cancelled: "-",
  skipped: ">",
}

const UNICODE_SPINNER = ["◐", "◓", "◑", "◒"]
const ASCII_SPINNER = ["|", "/", "-", "\\"]

export function createTheme(options: ThemeOptions = {}): Theme {
  const env = options.env ?? {}
  const color = options.color ?? (options.isTTY === true && env.NO_COLOR === undefined)
  const ascii = options.ascii ?? env.OMO_ASCII === "1"
  const paint = (name: ThemeColor, text: string): string => {
    if (!color || text.length === 0) return text
    return `${ANSI_COLORS[name]}${text}${RESET}`
  }
  const wrap = (code: string, text: string): string => (color && text.length > 0 ? `${code}${text}${RESET}` : text)
  const glyphs = ascii ? ASCII_STATE_GLYPHS : UNICODE_STATE_GLYPHS
  const spinnerFrames = ascii ? ASCII_SPINNER : UNICODE_SPINNER
  return {
    color,
    ascii,
    paint,
    bold: (text) => wrap(BOLD, text),
    dim: (text) => wrap(DIM, text),
    inverse: (text) => wrap(INVERSE, text),
    stateGlyph: (state) => glyphs[state] ?? "?",
    runGlyph: (status) => {
      if (status === "running") return ascii ? "*" : "◐"
      if (status === "paused") return ascii ? "||" : "Ⅱ"
      if (status === "completed") return ascii ? "v" : "✓"
      if (status === "failed") return ascii ? "x" : "✗"
      if (status === "cancelled") return ascii ? "-" : "⊘"
      return ascii ? "." : "·"
    },
    spinner: (frame) => spinnerFrames[((frame % spinnerFrames.length) + spinnerFrames.length) % spinnerFrames.length] ?? "?",
  }
}

export function stateColor(state: DagNodeState): ThemeColor {
  return state
}

export function runStatusColor(status: DagRunStatus | string): ThemeColor {
  if (
    status === "pending"
    || status === "running"
    || status === "paused"
    || status === "completed"
    || status === "failed"
    || status === "cancelled"
  ) {
    return status
  }
  return "muted"
}
