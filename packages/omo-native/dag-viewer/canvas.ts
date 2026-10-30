import { charWidth, truncateText } from "./text"
import type { ThemeColor } from "./theme"

export type CanvasStyle = {
  readonly color?: ThemeColor
  readonly bold?: boolean
  readonly dim?: boolean
  readonly inverse?: boolean
}

export type CanvasCell = {
  readonly ch: string
  readonly style?: CanvasStyle
}

export type BoxChars = {
  readonly tl: string
  readonly tr: string
  readonly bl: string
  readonly br: string
  readonly h: string
  readonly v: string
}

export const UNICODE_BOX: BoxChars = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" }
export const ASCII_BOX: BoxChars = { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" }

export class Canvas {
  readonly width: number
  readonly height: number
  private readonly cells: CanvasCell[][]

  constructor(width: number, height: number) {
    this.width = Math.max(0, width)
    this.height = Math.max(0, height)
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => ({ ch: " " })),
    )
  }

  set(x: number, y: number, ch: string, style?: CanvasStyle): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const row = this.cells[y]
    if (row === undefined) return
    row[x] = { ch, style }
  }

  text(x: number, y: number, value: string, style?: CanvasStyle): void {
    let cursor = x
    for (const char of value) {
      const width = charWidth(char)
      if (width === 0) continue
      if (cursor >= this.width) break
      this.set(cursor, y, char, style)
      if (width === 2 && cursor + 1 < this.width) this.set(cursor + 1, y, "", style)
      cursor += width
    }
  }

  hline(x: number, y: number, length: number, ch: string, style?: CanvasStyle): void {
    for (let offset = 0; offset < length; offset += 1) this.set(x + offset, y, ch, style)
  }

  vline(x: number, y: number, length: number, ch: string, style?: CanvasStyle): void {
    for (let offset = 0; offset < length; offset += 1) this.set(x, y + offset, ch, style)
  }

  box(x: number, y: number, width: number, height: number, style?: CanvasStyle, chars: BoxChars = UNICODE_BOX): void {
    if (width <= 0 || height <= 0) return
    if (width === 1) {
      this.vline(x, y, height, chars.v, style)
      return
    }
    if (height === 1) {
      this.hline(x, y, width, chars.h, style)
      return
    }
    this.set(x, y, chars.tl, style)
    this.set(x + width - 1, y, chars.tr, style)
    this.set(x, y + height - 1, chars.bl, style)
    this.set(x + width - 1, y + height - 1, chars.br, style)
    this.hline(x + 1, y, width - 2, chars.h, style)
    this.hline(x + 1, y + height - 1, width - 2, chars.h, style)
    this.vline(x, y + 1, height - 2, chars.v, style)
    this.vline(x + width - 1, y + 1, height - 2, chars.v, style)
  }

  fill(style?: CanvasStyle): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) this.set(x, y, " ", style)
    }
  }

  toLines(paint: (text: string, style: CanvasStyle | undefined) => string): string[] {
    const lines: string[] = []
    for (const row of this.cells) {
      let line = ""
      let chunk = ""
      let chunkStyle: CanvasStyle | undefined
      for (const cell of row) {
        if (cell.ch === "") continue
        if (chunk.length === 0) {
          chunkStyle = cell.style
          chunk = cell.ch
          continue
        }
        if (sameStyle(chunkStyle, cell.style)) {
          chunk += cell.ch
          continue
        }
        line += paint(chunk, chunkStyle)
        chunkStyle = cell.style
        chunk = cell.ch
      }
      if (chunk.length > 0) line += paint(chunk, chunkStyle)
      lines.push(line)
    }
    return lines
  }
}

function sameStyle(left: CanvasStyle | undefined, right: CanvasStyle | undefined): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  return left.color === right.color
    && left.bold === right.bold
    && left.dim === right.dim
    && left.inverse === right.inverse
}

export function clipLine(value: string, width: number): string {
  return truncateText(value, width)
}
