# @ljoukov/ui-agent

SvelteKit component library scaffolded with the official `sv` CLI.

## Teaching Agent Library

This package now includes a filesystem-backed teaching session library:

- `TeachingAgentSession`
- `TEACHING_CONTROL_BINDINGS`
- `TEACHING_SESSION_FILES`

The session is designed for agentic UI loops where the host and LLM coordinate through file-backed controls instead of
regenerating the full screen each turn.

Default runtime model setup:

- model: `chatgpt-gpt-5.3-codex`
- reasoning effort: `xhigh`

### Example: UKMT Hamilton H6 Socratic Session

```sh
npm run example:ukmt-h6
```

See `examples/ukmt-h6-socratic/README.md` for the state/file mapping and behavior.

## Status

- Package name: `@ljoukov/ui-agent`
- License: `MIT`
- npm publish status: not published yet
- Backend runtime dependency: `@ljoukov/llm`

When you're ready to publish to npm:

```sh
npm login
npm run check
npm run build
npm publish --access public
```

## Development

```sh
npm install
npm run dev -- --open
```

## Library Structure

- `src/lib` contains components and exports for the package
- `src/routes` is a local preview/showcase app

## Scaffold Command (latest)

```sh
npx sv create --template library --types ts --install npm .
```

For a non-empty directory, add:

```sh
--no-dir-check
```
