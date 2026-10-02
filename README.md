# Inkwell

Inkwell is a real-time collaborative whiteboard. Multiple users can draw, erase, select, and undo/redo strokes on a shared infinite canvas with live presence cursors and persistent board state.

## Stack

| Layer             | Technology                           |
| ----------------- | ------------------------------------ |
| Frontend          | React 19 + TypeScript + Vite + Konva |
| Backend           | Node.js + Express 5 + Socket.IO      |
| Database          | PostgreSQL + Drizzle ORM             |
| Cache / In-Memory | Redis                                |
| Pub-Sub           | Redis Pub-Sub                        |
| Containerization  | Docker + Docker Compose              |

## Features

- **Infinite canvas** — pan and zoom with world-space coordinate transforms
- **Drawing tools** — brush (stroke simplification + Chaikin smoothing), shapes (rectangle, circle, line, arrow), eraser
- **Selection tool** — Konva Transformer for move, scale, and rotate
- **Undo / Redo** — command-based history with local stack approach for distributed conflict resolution
- **Presence** — live cursor positions and join/leave events for connected users
- **Persistence** — Board state snapshots saved to PostgreSQL, with Redis in-memory buffer for commands
- **Sync on join** — full state sync on first join, delta sync on reconnect via `lastSeq`
- **Draw permissions** — per-board `anyone` / `owner` access control
- **Horizontal scaling** — Socket.IO Redis adapter routes broadcasts across multiple backend instances

## Project structure

```
frontend/   React + Vite app
backend/    Express + Socket.IO server
```

## Getting started

### With Docker (recommended)

Copy the example env file and fill in values, then start all services:

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

| Service    | URL                   |
| ---------- | --------------------- |
| Frontend   | http://localhost:5173 |
| Backend    | http://localhost:5000 |
| PostgreSQL | localhost:5432        |
| Redis      | localhost:6379        |

### Without Docker

**Backend**

```bash
cd backend
cp .env.example ./backend/.env   # fill in backend values
npm install
npm run db:migrate
npm run dev
```

**Frontend**

```bash
cd frontend
cp .env.example ./frontend/.env   # fill in frontend values
npm install
npm run dev
```

The frontend dev server starts at http://localhost:5173. Set `VITE_BACKEND_API_URL` and `VITE_BACKEND_WS_URL` in `frontend/.env` to point at the backend.

### Frontend scripts

```bash
npm run dev       # Vite dev server
npm run build     # TypeScript check + production build
npm run lint      # ESLint
npm run preview   # Preview production build locally
```

### Backend scripts

```bash
npm run dev          # tsx watch (hot reload)
npm run build        # tsc compile to dist/
npm run start        # run compiled dist/server.js
npm run db:generate  # generate Drizzle migration
npm run db:migrate   # apply migrations
npm run db:studio    # Drizzle Studio
```

## Environment variables

See [`.env.example`](.env.example) for all required variables. Key ones:

| Variable               | Description                        |
| ---------------------- | ---------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string       |
| `REDIS_URL`            | Redis connection string            |
| `CORS_ORIGIN`          | Allowed frontend origin            |
| `VITE_BACKEND_API_URL` | Backend HTTP base URL (build-time) |
| `VITE_BACKEND_WS_URL`  | Backend WebSocket URL (build-time) |

## Architecture

### Frontend

- **Tools** — `BrushTool`, `ShapesTool`, `EraserTool`, `SelectionTool`; all lazy-loaded via `ToolManager`
- **Commands** — `StrokeCommand`, `ShapeCommand`, `EraseCommand`, `TransformCommand`; serializable, apply/undo/redo
- **CommandManager** — local history stack with network broadcast hooks
- **ConnectionManager** — typed Socket.IO client wrapper; tracks `lastSeq` for delta sync
- **Stores** — Zustand: `settingsStore` (tool settings), `userStore` (identity + color), `toolStore` (active tool)

### Backend

- **REST** — `POST /api/boards` (create board), `GET /api/boards/:roomId` (lookup)
- **Socket.IO events**

  | Event                              | Direction       | Description                              |
  | ---------------------------------- | --------------- | ---------------------------------------- |
  | `room:join`                        | client → server | Join room, receive full or delta sync    |
  | `room:sync`                        | server → client | Board state on join / reconnect          |
  | `command:create`                   | client → server | Broadcast new command to room            |
  | `command:update`                   | client → server | Broadcast in-progress update             |
  | `command:finalize`                 | client → server | Persist command, broadcast with sequence |
  | `command:cancel`                   | client → server | Remove pending command                   |
  | `command:undo` / `command:redo`    | client → server | Broadcast undo/redo                      |
  | `command:reject`                   | server → client | Notify originator of rejected command    |
  | `presence:join` / `presence:leave` | server → room   | User joined or left                      |
  | `presence:move`                    | client → server | Cursor position update                   |

- **State service** — Redis-backed in-memory command buffer per room; snapshot written periodically and on room idle
- **Auth** — anonymous; `userId`, `userName`, `userColor` passed in Socket.IO handshake auth

## Production deployment

```bash
cp .env.example .env   # fill in production values
docker compose -f docker-compose.prod.yml up --build -d
```

Frontend is served by nginx on port 80. Backend runs on port 3000.


## TODO

### Product & Sharing
- [x] Add authenticated users or durable sessions
- [x] Replace `anyone` / `owner` access with `owner` / `editor` / `viewer`
- [x] Add invite links with maybe expiration
- [x] Add direct board sharing and permissions UI
- [ ] Add a board dashboard for create / rename / duplicate / archive / delete
- [ ] Add board thumbnails

### Canvas & Tools
- [ ] Add a text tool
- [ ] Add image embedding
- [ ] Add export to PNG and SVG
- [ ] Add a minimap
- [ ] Add zoom controls UI
- [x] Add snap-to-grid and alignment guides lines
- [x] Add optional grid toggle
- [ ] Add keyboard shortcuts panel
- [ ] Add templates
- [x] Add a landing page

### Collaboration
- [ ] Show active collaborator list with presence states
- [x] Add cursor name labels
- [ ] Add toast notifications
- [ ] Add object attribution: creator, editor, timestamps
- [ ] Add optional soft locks for conflicting edits
- [x] Add read-only viewer mode and share links

### Reliability / Production
- [ ] Add saved / syncing / offline / reconnect states
- [ ] Improve reconnect and delta-sync recovery
- [ ] Add rate limiting and input validation
- [ ] Add health checks and readiness endpoints
- [ ] Add structured logs and metrics
- [ ] Add observability with error tracking
- [ ] Add backup and restore procedures

### Testing / DevOps
- [x] Add unit tests for core logic
- [x] Add integration tests for API and socket flows
- [x] Add E2E tests for main user journeys
- [x] Add CI for lint, typecheck, test, and build
- [ ] Add release workflow
- [ ] Add live demo deployment
- [ ] Expand README with setup, architecture, data model, and demo GIF


## License

See [`LICENSE`](LICENSE) for license terms.
