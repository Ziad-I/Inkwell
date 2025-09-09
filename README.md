# Inkwell

Inkwell is an in-progress real-time collaborative whiteboard project. The goal is to provide a performant, low-latency experience for multiple users to draw, select, and manipulate strokes on a shared canvas.

This repository contains both frontend and backend code. Work is currently focused on the frontend implementation (see the `frontend/` folder).

## Current status

- Project goal: a full real-time collaborative whiteboard with presence, history/undo, selection tools, and persistence.
- Active work: Frontend UI and core drawing/interaction logic implemented using React + Konva.
- Backend: planned (real-time networking, conflict resolution, persistence). Not yet implemented.

## Frontend (what you can run today)

The frontend lives in the `frontend/` directory and is a Vite + React + TypeScript app.

Quick start (from the repository root):

1. Change into the frontend directory:

```cmd
cd frontend
```

1. Install dependencies:

```cmd
npm install
```

3. Start the development server:

```cmd
npm run dev
```

This will start Vite and open the app at http://localhost:5173 by default.

Available scripts (see `frontend/package.json`):

- `dev` - start dev server (Vite)
- `build` - compile TypeScript project and build the frontend for production
- `lint` - run ESLint over the frontend code
- `preview` - preview the production build

## Architecture highlights

- Frontend: React + TypeScript + Konva for canvas/stage rendering.
- State: lightweight stores and hooks (Zustand + custom hooks) to manage tools, history, and settings.
- Backend: Not yet implemented.

## TODO

- [x] Infinite canvas viewport (pan + zoom + world coords)
- [x] Local pen tool with path capture & simplification
- [x] Vertical side toolbar (icons, active state, tooltips. etc...)
- [x] Eraser (whole-stroke removal)
- [x] Stroke-based selection & move (lasso / multi-select)
- [x] Undo / Redo (local + broadcast hooks; tombstone approach)
- [x] Presence cursors (client-only simulation)
- [ ] Shape Tool (rectangle, circle, arrow, etc...)
- [ ] Add more tools
- [ ] Implement a backend WebSocketserver to broadcast drawing events.
- [ ] Show live cursors for connected users.
- [ ] Add room/session management and server-side persistence of whiteboards.
- [ ] Implement canvas loading on user join.
- [ ] Tests, CI, and deployment.

## License

See the repository `LICENSE` file for license terms.
