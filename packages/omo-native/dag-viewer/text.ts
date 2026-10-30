import { stripTerminalControls } from "@oh-my-opencode/senpi-task/renderer-text"

const ANSI_PATTERN = /[\u001b\u009b]/
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
]

export function sanitizeText(value: string): string {
  return stripTerminalControls(value).replace(/\s+/gu, " ").trim()
}

export function charWidth(char: string): number {
  const code = char.codePointAt(0)
  if (code === undefined) return 0
  if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) return 0
  if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return 0
  if (code >= 0x300 && code <= 0x36f) return 0
  for (const [start, end] of WIDE_RANGES) {
    if (code >= start && code <= end) return 2
  }
  return 1
}

export function displayWidth(value: string): number {
  let width = 0
  for (const char of value) width += charWidth(char)
  return width
}

export function truncateText(value: string, width: number): string {
  if (width <= 0) return ""
  let result = ""
  let used = 0
  for (const char of value) {
    const next = charWidth(char)
    if (used + next > width) break
    result += char
    used += next
  }
  return result
}

export function truncateWithEllipsis(value: string, width: number, ellipsis = "..."): string {
  if (width <= 0) return ""
  if (displayWidth(value) <= width) return value
  const room = width - displayWidth(ellipsis)
  if (room <= 0) return truncateText(ellipsis, width)
  return `${truncateText(value, room)}${ellipsis}`
}

export function visibleWidth(value: string): number {
  return displayWidth(stripTerminalControls(value))
}

export function padVisible(value: string, width: number): string {
  const visible = visibleWidth(value)
  return visible >= width ? value : value + " ".repeat(width - visible)
}

export function padText(value: string, width: number): string {
  const clipped = truncateText(value, width)
  return clipped + " ".repeat(Math.max(0, width - displayWidth(clipped)))
}

export function padStartText(value: string, width: number): string {
  const clipped = truncateText(value, width)
  return " ".repeat(Math.max(0, width - displayWidth(clipped))) + clipped
}

export function wrapText(value: string, width: number, maxLines = Number.POSITIVE_INFINITY): string[] {
  if (width <= 0 || maxLines <= 0) return []
  const normalized = sanitizeText(value)
  if (normalized.length === 0) return []
  const words = normalized.split(" ").filter((word) => word.length > 0)
  const all: string[] = []
  let line = ""
  let overflow = false
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`
    if (displayWidth(candidate) <= width) {
      line = candidate
      continue
    }
    if (line.length > 0) {
      all.push(line)
      line = ""
      if (all.length > maxLines) {
        overflow = true
        break
      }
    }
    if (displayWidth(word) <= width) {
      line = word
      continue
    }
    let rest = word
    while (rest.length > 0) {
      const chunk = truncateText(rest, width)
      if (chunk.length === 0) break
      all.push(chunk)
      rest = rest.slice(chunk.length)
      if (all.length > maxLines) {
        overflow = true
        break
      }
    }
    if (overflow) break
    line = rest
  }
  if (!overflow && line.length > 0) all.push(line)
  const lines = all.slice(0, maxLines === Number.POSITIVE_INFINITY ? all.length : maxLines)
  if (overflow || all.length > maxLines) {
    const lastIndex = lines.length - 1
    if (lastIndex >= 0) lines[lastIndex] = `${truncateText(lines[lastIndex] ?? "", Math.max(0, width - 3))}...`
  }
  return lines
}

export function containsControl(value: string): boolean {
  return ANSI_PATTERN.test(value)
}
