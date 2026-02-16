# @ljoukov/ui-agent

SvelteKit component library scaffolded with the official `sv` CLI.

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
