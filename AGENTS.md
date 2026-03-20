# Agent Guide: todos-backend

## What this repo is

The backend API and WebSocket server for the todos product. Implements user stories from the product spec repo at https://github.com/agentpotm/todos-product.

Always read the relevant spec(s) from todos-product before implementing a feature. The spec is the source of truth for acceptance criteria.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| Database | PostgreSQL |
| ORM | Drizzle |
| Auth | JWT (15min) + refresh token in HttpOnly cookie (30 days) |
| Real-time | WebSocket (`ws` library) alongside HTTP server |
| Testing | Vitest (integration tests hit real DB) |
| Validation | Zod |

## Project Structure

```
todos-backend/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── src/
│   ├── index.ts            (server entry: HTTP + WS)
│   ├── db/
│   │   ├── schema.ts       (Drizzle schema)
│   │   └── client.ts       (DB connection)
│   ├── routes/
│   │   ├── auth.ts         (POST /auth/register, /login, /refresh, /logout)
│   │   └── todos.ts        (GET/POST/PATCH/DELETE /todos)
│   ├── services/
│   │   ├── auth.ts
│   │   └── todos.ts
│   ├── ws/
│   │   └── server.ts       (WebSocket server, broadcasts todo events)
│   ├── middleware/
│   │   └── auth.ts         (JWT verification middleware)
│   └── types/
│       └── index.ts
└── tests/
    ├── auth.test.ts
    └── todos.test.ts
```

## Conventions

- Routes → service layer → DB. No business logic in route handlers.
- Auth middleware on all `/api/*` routes.
- Integration tests only — no mocking the DB. Use `TEST_DATABASE_URL` env var.
- All routes return JSON. Errors: `{ error: string }` with appropriate status code.

## Auth Flow

```
POST /auth/register  → hash password, create user, set refresh cookie, return { token }
POST /auth/login     → validate credentials, set refresh cookie, return { token }
POST /auth/refresh   → validate refresh cookie, return new { token }
POST /auth/logout    → clear refresh cookie
```

## WebSocket Event Schema

All events:
```json
{ "type": "<resource>:<action>", "payload": { ... } }
```

Events: `todo:created`, `todo:updated`, `todo:deleted`
Each event is broadcast to all active WS connections for the authenticated user.

## Workflow

1. Read the spec from todos-product for the story you're implementing
2. Only implement specs with `stage: ready`
3. Implement routes + service + tests
4. Open a PR — title format: `feat(backend): <spec-name>` (e.g. `feat(backend): auth/login`)
5. After PR is merged, update `specs/status.yml` in todos-product:
   `backend: { state: done, version: <spec_version> }`

## Definition of Done

- [ ] All acceptance criteria from the spec pass
- [ ] Integration tests written and passing against real test DB
- [ ] No TypeScript errors
- [ ] PR references the spec (e.g. `Implements agentpotm/todos-product spec: auth/login`)
