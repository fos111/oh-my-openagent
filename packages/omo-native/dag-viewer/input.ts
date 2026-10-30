export type ViewerKey =
  | "quit"
  | "up"
  | "down"
  | "left"
  | "right"
  | "page-up"
  | "page-down"
  | "follow"
  | "pause"
  | "all"
  | "tree"
  | "refresh"
  | "help"
  | "run-prev"
  | "run-next"
  | "unknown"

export function decodeKeys(chunk: string): ViewerKey[] {
  const keys: ViewerKey[] = []
  let index = 0
  while (index < chunk.length) {
    const char = chunk[index]
    if (char === "\u001b") {
      const next = chunk[index + 1]
      if (next === undefined) {
        keys.push("quit")
        index += 1
        continue
      }
      if (next === "[" || next === "O") {
        const end = sequenceEnd(chunk, index + 2)
        const sequence = chunk.slice(index, end)
        keys.push(verticalKey(sequence))
        index = end
        continue
      }
      index += 1
      continue
    }
    const key = singleKey(char)
    if (key !== undefined) keys.push(key)
    index += 1
  }
  return keys
}

function sequenceEnd(value: string, start: number): number {
  let index = start
  while (index < value.length) {
    const code = value.charCodeAt(index)
    index += 1
    if (code >= 0x40 && code <= 0x7e) break
  }
  return index
}

function verticalKey(sequence: string): ViewerKey {
  if (sequence === "\u001b[A" || sequence === "\u001bOA") return "up"
  if (sequence === "\u001b[B" || sequence === "\u001bOB") return "down"
  if (sequence === "\u001b[C" || sequence === "\u001bOC") return "right"
  if (sequence === "\u001b[D" || sequence === "\u001bOD") return "left"
  if (sequence === "\u001b[5~") return "page-up"
  if (sequence === "\u001b[6~") return "page-down"
  return "unknown"
}

function singleKey(char: string): ViewerKey | undefined {
  switch (char) {
    case "q":
    case "Q":
    case "\u0003":
      return "quit"
    case "j":
      return "down"
    case "k":
      return "up"
    case "h":
      return "left"
    case "l":
      return "right"
    case "[":
      return "run-prev"
    case "]":
      return "run-next"
    case "f":
      return "follow"
    case "p":
      return "pause"
    case "a":
      return "all"
    case "t":
      return "tree"
    case "r":
      return "refresh"
    case "?":
      return "help"
    default:
      return undefined
  }
}
