# UKMT H6 Socratic Teaching Example

This example demonstrates a filesystem-backed interactive teaching session for UKMT Hamilton Olympiad H6 (2025).

The host app writes student input to file-backed controls, and the LLM agent updates only guidance-related files via
filesystem tools (`apply_patch`, `read_file`, `list_dir`, etc.).

## File-State Mapping

`TeachingAgentSession` uses this control/state layout inside the workspace directory:

- `problem.md`: immutable problem statement used for context.
- `controls/prompt.md`: top gray prompt shown to the student.
- `controls/student-attempt.md`: student text input (editable by host/student).
- `controls/teacher-directions.md`: gray Socratic feedback written by agent.
- `state/teacher-memory.md`: hidden agent memory for continuity across turns.
- `state/turn.json`: numeric turn counter (`{"turn": <n>}`).

This mapping avoids full screen regeneration by the model. The UI can re-render by reading just the changed control
files.

## Run

From repo root:

```bash
npm run example:ukmt-h6
```

The script:

- initializes a session workspace
- prints initial textview
- simulates one student attempt
- runs the real agent using `chatgpt-gpt-5.3-codex` with `xhigh` reasoning effort
- saves transcript at `examples/ukmt-h6-socratic/runtime-workspace/transcript.txt`
