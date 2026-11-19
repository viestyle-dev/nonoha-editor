# nonoha-editor

Web-based visual editor for building and monitoring nonoha-engine graphs. Place nodes, connect their ports, set their properties, and watch the data flowing through the graph in live views. It connects to a running [nonoha-engine](https://github.com/viestyle-dev/nonoha-engine), which runs the graph and can serve the editor at `/editor`.

![A graph in nonoha-editor: nodes and their connections above, live views of the data below](https://hub.nonoha.dev/screens/editor-motion.webp)

## The nonoha ecosystem

nonoha is node-based programming redesigned for the era of developing together with AI: a Python framework for real-time signal processing and applications. AI agents write a graph as code, people edit the same graph as a diagram, and an engine with no GUI runs it.

<a href="https://hub.nonoha.dev/ecosystem/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://hub.nonoha.dev/screens/ecosystem-dark.webp">
    <img src="https://hub.nonoha.dev/screens/ecosystem-light.webp" width="100%" alt="The nonoha codebases in five layers, each depending on the ones below it. Tools and UIs: nonoha Hub, its CLI, nonoha-editor, custom web UIs, and your own apps. Clients: nonoha-client-js. Runtimes: nonoha-engine, and nonoha-embedded inside apps. Nodes: sci-nodes and plugins. Core: nonoha-core, on NumPy.">
  </picture>
</a>

| Layer | Codebases |
| --- | --- |
| Tools and UIs | [nonoha Hub and its CLI](https://hub.nonoha.dev/), **nonoha-editor** (this repository), your own web UI or app |
| Clients | [nonoha-client-js](https://github.com/viestyle-dev/nonoha-client-js) |
| Runtimes | [nonoha-engine](https://github.com/viestyle-dev/nonoha-engine) (standalone), [nonoha-embedded](https://github.com/viestyle-dev/nonoha-embedded) (inside an app) |
| Nodes | [sci-nodes](https://github.com/viestyle-dev/sci-nodes), [plugins](https://hub.nonoha.dev/plugins/) |
| Core | [nonoha-core](https://github.com/viestyle-dev/nonoha-core) |

The [nonoha website](https://hub.nonoha.dev/) has the [documentation](https://hub.nonoha.dev/docs/) and [workspaces](https://hub.nonoha.dev/workspaces/) to start from.

## Features

- Visual node graph editing with drag-and-drop
- Real-time data visualization (line charts, scatter plots, heatmaps)
- Engine nodes for signal processing and computation
- Editor nodes for input/output and visualization
- Copy/paste support for nodes and edges
- WebSocket-based real-time updates

## Prerequisites

- Node.js 18.17+
- A running [nonoha-engine](https://github.com/viestyle-dev/nonoha-engine) backend

## Getting Started

```bash
# Clone with the nonoha-client-js submodule
git clone --recursive https://github.com/viestyle-dev/nonoha-editor.git
cd nonoha-editor

# Install dependencies
npm ci

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The editor requires nonoha-engine to be running, for example from a
clone of the engine repository:

```bash
uv run main.py --vnf flows/default.vnf
```

See the [nonoha-engine README](https://github.com/viestyle-dev/nonoha-engine)
for engine setup.

## Building for the engine

The engine serves the editor under `/editor`, so build it with that base path:

```bash
NEXT_PUBLIC_BASE_PATH=/editor npm run build   # PowerShell: $env:NEXT_PUBLIC_BASE_PATH="/editor"; npm run build
```

Then start the engine with `--editor-html <this repository>/out`, or copy `out/` to the engine's `editor_html/`.

## Project Structure

```text
nonoha-editor/
├── app/graphs/           # Graph editor page
│   ├── page.tsx          # Main graph editor
│   ├── types.ts          # Clipboard types
│   └── node-prototypes.ts
├── src/
│   ├── api/              # API functions
│   ├── components/       # Shared UI components
│   ├── constants/        # Constants and registries
│   ├── nodes/            # React Flow node components
│   │   ├── engine-nodes/ # Engine node wrappers
│   │   └── editor-nodes/ # Editor-only nodes
│   ├── stores/           # Global state
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
└── packages/
    ├── nonoha-client-js/  # Engine client library (git submodule)
    └── nonoha-views/      # Views: contract, host, catalog, built-in views
```

`packages/nonoha-client-js` is a git submodule of
[nonoha-client-js](https://github.com/viestyle-dev/nonoha-client-js);
clone with `--recursive` (or run
`git submodule update --init --recursive`). `packages/nonoha-views` holds
the views plugins add to the editor (and apps can show); its
[README](packages/nonoha-views/README.md) is the reference for writing one.

## Available Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start development server             |
| `npm run dev:watch`  | Development with dependency watching |
| `npm run build`      | Production build                     |
| `npm run lint`       | Run ESLint                           |
| `npm run build:iife` | Build the packages' browser scripts  |
| `npm test`           | Run tests (vitest)                   |
| `npm run clean`      | Clean build artifacts                |

## Key Technologies

- [Next.js](https://nextjs.org/) - React framework
- [React Flow](https://reactflow.dev/) - Node-based graph UI
- [Material UI](https://mui.com/) - Component library
- [Plotly.js](https://plotly.com/javascript/) - Data visualization
- [Emotion](https://emotion.sh/) - CSS-in-JS styling

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests require signing
the [CLA](CLA.md) (a bot will guide you on your first PR).

## License

[Apache-2.0](LICENSE). See also [NOTICE](NOTICE).

The bundled Geist fonts are licensed separately under the
[SIL Open Font License 1.1](app/fonts/OFL.txt).
