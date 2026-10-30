import { join } from "node:path"
import { pathToFileURL } from "node:url"

/**
 * `omo dag` bridges to the bundled viewer runtime. The viewer loads the senpi-task DAG store
 * read-only, so this command never needs the engine or a live session.
 */
export async function runDagCommand(args, options) {
  const { pluginRoot, cwd, env, stdout, stderr } = options
  const runtime = join(pluginRoot, "runtime", "dag-viewer", "index.js")
  let module
  try {
    module = await import(pathToFileURL(runtime).href)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    stderr.write(`omo dag: the DAG viewer runtime could not be loaded from ${runtime}: ${message}\n`)
    return 1
  }
  return module.runDagCommand(args, { cwd, env, stdin: process.stdin, stdout, stderr })
}
