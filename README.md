# todos-backend

The backend API server for the todos app. A Node.js/Express REST API with JWT authentication, PostgreSQL persistence, and a WebSocket server for real-time updates.

## What this server does

- Register and authenticate users with email and password
- Issue short-lived JWT access tokens and long-lived refresh tokens (stored in httpOnly cookies)
- Store todos in a PostgreSQL database, scoped per user
- Broadcast real-time events (create, update, delete) over WebSocket to all connected sessions for a user

---

## Tools and why we use them

| Tool | What it is | Why we use it |
|------|-----------|---------------|
| **Node.js** | JavaScript runtime | Runs JavaScript on the server (outside the browser). Fast for I/O-heavy workloads like API servers. |
| **TypeScript** | JavaScript with types | Catches type errors at write-time. Makes refactoring safer and auto-complete more helpful. |
| **Express** | Web framework | Minimal HTTP framework. Handles routing, middleware, and request/response. The most widely used Node.js web framework. |
| **PostgreSQL** | Relational database | Stores users and todos persistently. Supports ACID transactions, foreign keys, and cascading deletes. |
| **Drizzle ORM** | Database query builder | Type-safe SQL in TypeScript — you write queries in code and get typed results back. Also handles database schema migrations. |
| **jsonwebtoken** | JWT library | Creates and verifies JSON Web Tokens, which are the signed tokens used to authenticate API requests. |
| **bcryptjs** | Password hashing | Hashes passwords before storing them. Never stores plaintext passwords. |
| **zod** | Validation library | Validates and parses incoming request bodies. Returns clear errors if the payload is missing fields or has wrong types. |
| **ws** | WebSocket library | Handles WebSocket connections for real-time todo event broadcasting. |
| **tsx** | TypeScript runner | Runs TypeScript files directly in development without a compile step. Like `ts-node` but faster. |
| **Vitest** | Test runner | Runs the integration test suite. Tests run against a real PostgreSQL test database. |

---

## Architecture

```
src/
├── index.ts                  # Entry point: creates the Express app and HTTP server, attaches WebSocket server
├── routes/
│   ├── auth.ts               # Auth endpoints: /auth/register, /auth/login, /auth/refresh, /auth/logout
│   └── todos.ts              # Todo endpoints: GET/POST /todos, PATCH/DELETE /todos/:id
├── services/
│   ├── auth.ts               # Auth business logic: hashing, token creation, refresh token management
│   └── todos.ts              # Todo business logic: CRUD operations
├── middleware/
│   └── auth.ts               # JWT auth middleware — validates the token on protected routes
├── db/
│   ├── schema.ts             # Database schema (users, refresh_tokens, todos tables)
│   └── client.ts             # Database connection pool and Drizzle instance
├── ws/
│   └── server.ts             # WebSocket server: authenticates connections, broadcasts todo events
└── types/
    └── index.ts              # Shared TypeScript types

tests/
├── globalSetup.ts            # Creates the test database and pushes the schema before any tests run
├── auth.test.ts              # Integration tests for registration, login, token refresh, logout
├── todos.test.ts             # Integration tests for todo CRUD
├── ws.test.ts                # Tests for WebSocket event broadcasting
└── connection-indicator.test.ts
```

### Database schema

Three tables:

```
users               refresh_tokens          todos
─────────           ──────────────          ─────
id (uuid PK)        id (uuid PK)            id (uuid PK)
email (unique)      userId → users.id       userId → users.id
passwordHash        token (unique)          title
createdAt           expiresAt               completed
updatedAt           createdAt               createdAt
                                            updatedAt
```

`refresh_tokens` and `todos` have a cascading delete on `userId` — deleting a user removes all their tokens and todos automatically.

### Authentication flow

1. **Register** → hash password with bcrypt, insert user, return 201
2. **Login** → verify password, issue a short-lived JWT (15 min) as a response body, issue a long-lived refresh token (30 days) as an httpOnly cookie
3. **Authenticated requests** → client sends the JWT as a Bearer token; the `auth` middleware verifies it
4. **Token refresh** → client sends the refresh token cookie to `/auth/refresh`; server issues a new JWT
5. **Logout** → server deletes the refresh token from the database and clears the cookie

### API endpoints

| Method | Path | Auth required | Description |
|--------|------|--------------|-------------|
| `GET` | `/health` | No | Health check |
| `POST` | `/auth/register` | No | Create a new account |
| `POST` | `/auth/login` | No | Log in, get JWT + refresh token cookie |
| `POST` | `/auth/refresh` | Cookie | Get a new JWT using refresh token |
| `POST` | `/auth/logout` | No | Clear refresh token |
| `GET` | `/todos` | JWT | List all todos for the authenticated user |
| `POST` | `/todos` | JWT | Create a new todo |
| `PATCH` | `/todos/:id` | JWT | Update a todo's title or completion state |
| `DELETE` | `/todos/:id` | JWT | Delete a todo |
| `WS` | `/ws?token=<jwt>` | JWT | Real-time todo event stream |

### WebSocket events

After connecting, the server pushes events to the client whenever a todo changes:

```json
{ "type": "todo:created", "payload": { "id": "...", "title": "...", "completed": false, ... } }
{ "type": "todo:updated", "payload": { "id": "...", "title": "...", "completed": true, ... } }
{ "type": "todo:deleted", "payload": { "id": "..." } }
```

Only events for the authenticated user's todos are sent to that connection.

---

## Prerequisites

- **Node.js 18 or later** — [download here](https://nodejs.org)
- **PostgreSQL 14 or later** — [download here](https://www.postgresql.org/download/)

Check versions:
```bash
node --version    # v18.x.x or higher
psql --version    # PostgreSQL 14.x or higher
```

### Install PostgreSQL (macOS)

The easiest way on macOS is with Homebrew:
```bash
brew install postgresql@16
brew services start postgresql@16
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the databases

Connect to PostgreSQL and create the two databases (one for development, one for tests):

```bash
psql -U postgres -c "CREATE DATABASE todos_dev;"
psql -U postgres -c "CREATE DATABASE todos_test;"
```

If your PostgreSQL user isn't `postgres`, replace it with your local user (often your macOS username on Homebrew installs):
```bash
psql -c "CREATE DATABASE todos_dev;"
psql -c "CREATE DATABASE todos_test;"
```

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todos_dev
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todos_test
JWT_SECRET=any-long-random-string-here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
PORT=3000
```

Change the username/password to match your PostgreSQL installation.

### 4. Run database migrations

On a fresh clone there are no migration files yet, so generate them first:

```bash
npm run db:generate
npm run db:migrate
```

If migration files already exist in `drizzle/` (e.g. you pulled them from the repo), skip `db:generate` and just run:

```bash
npm run db:migrate
```

### 5. Start the server

```bash
npm run dev
```

The server starts on `http://localhost:3000`. Test it:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start the server with hot reload (restarts on file save) |
| `npm run build` | Compile TypeScript to `dist/` for production |
| `npm run start` | Run the compiled production build from `dist/` |
| `npm run typecheck` | Check TypeScript types without building |
| `npm test` | Run the full integration test suite |
| `npm run db:generate` | Generate a new SQL migration file from schema changes |
| `npm run db:migrate` | Apply pending migrations to the database |

---

## Tests

```bash
npm test
```

Tests are **integration tests** — they run against a real PostgreSQL test database (`todos_test`), not mocks. This catches real problems that mock-based tests miss, like incorrect SQL, constraint violations, or migration issues.

Before the tests run, `tests/globalSetup.ts` automatically creates the test database and applies the current schema. You don't need to set it up manually.

Each test file tests a complete vertical slice (e.g. the entire auth flow: register → login → use token → refresh → logout).

---

## Contributing

### Step-by-step workflow

1. **Read the spec** in [todos-product](https://github.com/agentpotm/todos-product) under `specs/` — it defines the acceptance criteria
2. **Branch**: `git checkout -b feat/backend/<spec-name>`
3. **If adding new tables or columns**, update `src/db/schema.ts` and run `npm run db:generate` to create a migration, then `npm run db:migrate` to apply it
4. **Implement routes and services** following the existing patterns
5. **Write integration tests** in `tests/`
6. **Run `npm test`** — must pass with zero failures before pushing
7. **Run `npm run typecheck`** — must be clean
8. **Push and open a PR** titled `feat(backend): <spec-name>`

### Definition of done

- [ ] All spec acceptance criteria pass against the running server
- [ ] Integration tests written and passing (`npm test`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] PR references the spec

### Code conventions

- Route handlers are thin — they validate input (zod) and call a service function
- Service functions contain business logic — no Express types (`Request`, `Response`) inside services
- Never store plaintext passwords — always use `bcryptjs`
- Never log JWT secrets or password hashes
- All todo endpoints must check that the authenticated user owns the todo before modifying it
