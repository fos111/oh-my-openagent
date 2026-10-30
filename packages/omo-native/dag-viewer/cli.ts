import type { DagViewerOptions } from "./runtime"
import { runViewer } from "./runtime"

export type DagCommandIO = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly stdin: NodeJS.ReadStream
  readonly stdout: NodeJS.WriteStream
  readonly stderr: NodeJS.WriteStream
}

export const DAG_USAGE = `omo dag watch [options]

Read-only terminal viewer for mass ulw DAG runs.

Options:
  --project <dir>      project directory to inspect (default: current directory)
  --state-dir <dir>    explicit DAG state root (the directory containing runs/ and events/)
  --all-projects       include every project under the omo agent directory
  --run <id|name>      run to open (default: newest)
  --agent-dir <dir>    omo agent directory override
  --interval <ms>      refresh interval in milliseconds (default: 1000)
  --once               print one frame and exit
  --json               print a JSON snapshot and exit
  --tree               force the tree renderer
  --no-color           disable ANSI colors
  --ascii              use ASCII-only glyphs
  -h, --help           show this help`

type Parsed = {
  readonly options: Omit<DagViewerOptions, "cwd" | "env" | "stdin" | "stdout" | "stderr">
  readonly help: boolean
}

export async function runDagCommand(argv: readonly string[], io: DagCommandIO): Promise<number> {
  const subcommand = argv[0]
  if (subcommand === undefined) {
    io.stderr.write(`${DAG_USAGE}\n`)
    return 2
  }
  if (subcommand === "--help" || subcommand === "-h") {
    io.stdout.write(`${DAG_USAGE}\n`)
    return 0
  }
  if (subcommand !== "watch") {
    io.stderr.write(`omo dag: unknown subcommand '${subcommand}'\n${DAG_USAGE}\n`)
    return 2
  }
  const parsed = parseWatchArgs(argv.slice(1))
  if ("error" in parsed) {
    io.stderr.write(`omo dag watch: ${parsed.error}\n${DAG_USAGE}\n`)
    return 2
  }
  if (parsed.help) {
    io.stdout.write(`${DAG_USAGE}\n`)
    return 0
  }
  try {
    return await runViewer({
      ...parsed.options,
      cwd: io.cwd,
      env: io.env,
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
    })
  } catch (error) {
    io.stderr.write(`omo dag watch: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function parseWatchArgs(args: readonly string[]): Parsed | { error: string } {
  const options: {
    projectDir?: string
    stateDir?: string
    agentDir?: string
    runSelector?: string
    allProjects: boolean
    intervalMs: number
    once: boolean
    json: boolean
    tree: boolean
    color?: boolean
    ascii?: boolean
  } = {
    allProjects: false,
    intervalMs: 1000,
    once: false,
    json: false,
    tree: false,
  }
  let help = false
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]
    if (raw === undefined) continue
    const [flag, inline] = raw.startsWith("--") && raw.includes("=")
      ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)]
      : [raw, undefined]
    const value = (): string | undefined => {
      if (inline !== undefined) return inline
      const next = args[index + 1]
      if (next === undefined || next.startsWith("--")) return undefined
      index += 1
      return next
    }
    switch (flag) {
      case "--project": {
        const project = value()
        if (project === undefined) return { error: "--project expects a directory" }
        options.projectDir = project
        break
      }
      case "--state-dir": {
        const stateDir = value()
        if (stateDir === undefined) return { error: "--state-dir expects a directory" }
        options.stateDir = stateDir
        break
      }
      case "--agent-dir": {
        const agentDir = value()
        if (agentDir === undefined) return { error: "--agent-dir expects a directory" }
        options.agentDir = agentDir
        break
      }
      case "--run": {
        const run = value()
        if (run === undefined) return { error: "--run expects an id or name" }
        options.runSelector = run
        break
      }
      case "--interval": {
        const interval = value()
        if (interval === undefined) return { error: "--interval expects milliseconds" }
        const parsed = Number.parseInt(interval, 10)
        if (!Number.isFinite(parsed) || parsed < 100) return { error: "--interval expects an integer of at least 100" }
        options.intervalMs = parsed
        break
      }
      case "--all-projects":
        options.allProjects = true
        break
      case "--once":
        options.once = true
        break
      case "--json":
        options.json = true
        break
      case "--tree":
        options.tree = true
        break
      case "--no-color":
        options.color = false
        break
      case "--ascii":
        options.ascii = true
        break
      case "--help":
      case "-h":
        help = true
        break
      default:
        return { error: `unknown option '${raw}'` }
    }
  }
  return { options, help }
}
