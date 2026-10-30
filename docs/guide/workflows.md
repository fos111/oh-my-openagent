# Workflows

A workflow is a large job that OmO splits into smaller tasks and runs side by side. Each task waits only for the tasks it depends on, so work that doesn't depend on anything else starts right away.

## When to use one

Reach for a workflow when a job has many parts that can happen at once: fixing a list of bugs, updating a set of packages, reviewing every file in a folder, or looking into several questions. For one change in one place, a normal message is faster.

## Start a workflow

Put `mass ulw` in your message, then say what you want done:

```text
mass ulw fix every failing test in packages/api, one task per test file
```

In OmO Desktop, the **Start a workflow** button in the Workflows panel puts a starter message in the composer. Finish the sentence with your job and send it.

## What happens next

OmO reads the job, breaks it into tasks, and works out which tasks need others to finish first. It then runs the tasks in waves: everything that is ready runs at the same time, and each finished task unlocks the ones waiting on it. Every task is handled by its own [agent](agents.md), and OmO checks the results before it reports back to you.

## Follow a run in OmO Desktop

The Workflows panel lists every run in the thread, newest first. Open a run to see:

- each task and its state: Working, Done, Failed or Stopped
- a graph of the tasks and the order they depend on each other
- a live feed of what the running tasks are doing

Click a task to open the agent working on it and read what it did.

## Watch a run in your terminal

`omo dag watch` gives you the same picture without leaving the terminal: the task
graph, each task's state, the critical path, bottlenecks, a task inspector, and a
live feed of run events. It only reads the run; it cannot retry, steer, or change it.

```bash
omo dag watch                  # follow the newest run in this project
omo dag watch --all-projects   # pick from runs across projects
omo dag watch --tree           # start in the dependency-tree view
```

Use the arrow keys or `hjkl` to move between tasks, `tab` to switch runs, `a` to
toggle all projects, `?` for help, and `q` to quit. In scripts, `--once` prints one
frame and `--json` prints the snapshot as JSON. See the
[CLI reference](../reference/cli.md#dag-watch-omo-native) for every option.

## Stop or change a run

Tell OmO in the thread, for example "stop the workflow" or "skip the docs tasks". To stop one task right away, cancel its agent from the Agents panel.

## Related

- [Agents](agents.md): the helpers that run each task
- [Keywords](keywords.md): every word that starts a workflow like this one
