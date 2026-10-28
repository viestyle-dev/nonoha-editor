# nonoha-editor

Web-based visual editor for building and monitoring nonoha-engine graphs.

## Features

- Visual node graph editing with drag-and-drop
- Real-time data visualization (line charts, scatter plots, heatmaps)
- Engine nodes for signal processing and computation
- Editor nodes for input/output and visualization
- Copy/paste support for nodes and edges
- WebSocket-based real-time updates

## Prerequisites

- Node.js 18+
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
    └── nonoha-client-js/  # Engine client library (git submodule)
```

`packages/nonoha-client-js` is a git submodule of
[nonoha-client-js](https://github.com/viestyle-dev/nonoha-client-js);
clone with `--recursive` (or run
`git submodule update --init --recursive`).

## Available Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start development server             |
| `npm run dev:watch`  | Development with dependency watching |
| `npm run build`      | Production build                     |
| `npm run lint`       | Run ESLint                           |
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
