# Subagent extension

Generic background agents for pi with isolated context windows.

The tool starts disposable `pi -p --no-session` processes. There are no specialized agent files or project-local agent discovery. The parent session remains the orchestrator: it splits substantial work into independent tracks, delegates most reading, research, bounded implementation, and verification, then evaluates compact handoffs and owns the final synthesis. Small or tightly sequential work stays in the parent.

## Modes

- Single: `{ "task": "..." }`
- Parallel: `{ "tasks": [{ "task": "..." }, { "task": "..." }] }`

Start independent tracks in parallel early so the parent does not repeat their reconnaissance.

## Model routing

Model selection is orchestrator policy, not extension logic. Set `model` per task according to its shape:

- `openai/gpt-5.6-sol`: highest-stakes, ambiguous, long-horizon work.
- `openai/gpt-5.6-terra`: bounded engineering, implementation, and debugging.
- `openai/gpt-5.6-luna`: mechanical or high-volume evidence gathering and transformation.
- `zai/glm-5.2`: independent challenge, critique, and review.
- `moonshotai/kimi-k3`: huge or multimodal corpora.
- `anthropic/claude-opus-5`: prose and final drafting.

Use model diversity only when it adds an independent perspective. Every spawned Pi process is invoked with `--thinking xhigh`; `thinking` is not a tool input. A provider may map or clamp unsupported thinking levels.

## Defaults

- Max 8 parallel tasks, 4 concurrent processes.
- Read-only by default with `read`, `grep`, `find`, `ls`, and `bash`.
- Set `readOnly: false` to allow `edit` and `write` for focused, clearly owned changes.
- Optional per-task `cwd`, `model`, and `tools`.
- Damage-control checks still apply inside subagents. Matching calls request approval through the parent pi UI and fail closed if approval is unavailable.
- Handoffs should be compact and evidence-based, including relevant paths, verification, risks, and uncertainty.

## Example

```json
{
  "tasks": [
    {
      "task": "Implement the bounded extension changes and report paths plus checks.",
      "model": "openai/gpt-5.6-terra",
      "readOnly": false
    },
    {
      "task": "Independently review the requested behavior against the diff.",
      "model": "zai/glm-5.2"
    }
  ]
}
```
