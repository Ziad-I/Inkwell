# Inkwell — Frontend

Inkwell is a real-time collaborative whiteboard. this `frontend` folder is the current working area and hosts a modern React + TypeScript + Vite frontend.

This README documents the frontend: a quick overview, how to run it locally, and the project layout.

## Quick overview

- Goal: a full real-time collaborative whiteboard with presence, collaborative drawing, selection, history, and session management.
- Current focus: frontend implementation (UI, tools, local state management, and wiring for future realtime sync).
- Stack: React, TypeScript, Vite.

## Getting started (developer)

Prerequisites:

- Node.js (16+ recommended) and npm or pnpm/yarn.

Local dev (example using npm):

```bash
cd frontend
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Project structure (high level)

- `src/` — frontend app source
  - `components/` — UI components and board components (canvas, toolbar, widgets)
  - `commands/` — command implementation for undo/redo (stroke, erase, select...)
  - `core/` — command manager, tool loaders, tool manager
  - `hooks/` — custom hooks (command operations, key bindings, stage operations, theming)
  - `providers/` — React providers (theme, etc.)
  - `stores/` — simple state stores (settings, active tool)
  - `tools/` — tool implementations (brush, eraser, selection)
  - `types/` — shared TypeScript types
