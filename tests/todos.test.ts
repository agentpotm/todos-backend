import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { db, pool } from "../src/db/client";
import { users, refreshTokens, todos } from "../src/db/schema";
import authRoutes from "../src/routes/auth";
import todosRoutes from "../src/routes/todos";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);
app.use("/todos", todosRoutes);

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

beforeEach(async () => {
  await db.delete(todos);
  await db.delete(refreshTokens);
  await db.delete(users);
});

async function registerAndGetToken(
  email = "user@example.com",
  password = "securepassword"
): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json() as { token: string };
  return body.token;
}

describe("GET /todos", () => {
  it("returns 401 when no authorization header is provided", async () => {
    const res = await fetch(`${baseUrl}/todos`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 401 when an invalid token is provided", async () => {
    const res = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns empty array when user has no todos", async () => {
    const token = await registerAndGetToken();
    const res = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("returns all todos for the authenticated user", async () => {
    const token = await registerAndGetToken();

    // Create two todos
    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Buy groceries" }),
    });
    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Walk the dog" }),
    });

    const res = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ title: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    const titles = body.map((t) => t.title);
    expect(titles).toContain("Buy groceries");
    expect(titles).toContain("Walk the dog");
  });

  it("each todo item includes its text content (title)", async () => {
    const token = await registerAndGetToken();

    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Read a book" }),
    });

    const res = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(body[0]).toHaveProperty("title", "Read a book");
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("completed");
  });

  it("only returns todos belonging to the authenticated user", async () => {
    const tokenA = await registerAndGetToken("alice@example.com");
    const tokenB = await registerAndGetToken("bob@example.com");

    // Alice creates a todo
    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "Alice's todo" }),
    });

    // Bob creates a todo
    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ title: "Bob's todo" }),
    });

    // Bob should only see his own todos
    const res = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ title: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Bob's todo");
  });
});

describe("DELETE /todos/:id", () => {
  it("returns 401 when no authorization header is provided", async () => {
    const res = await fetch(`${baseUrl}/todos/some-id`, { method: "DELETE" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 204 and removes the todo", async () => {
    const token = await registerAndGetToken();

    const createRes = await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "To be deleted" }),
    });
    const created = await createRes.json() as { id: string };

    const deleteRes = await fetch(`${baseUrl}/todos/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleteRes.status).toBe(204);

    const listRes = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const todos = await listRes.json() as Array<unknown>;
    expect(todos).toHaveLength(0);
  });

  it("returns 404 when todo does not exist", async () => {
    const token = await registerAndGetToken();
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const res = await fetch(`${baseUrl}/todos/${nonExistentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("cannot delete a todo belonging to another user", async () => {
    const tokenA = await registerAndGetToken("alice@example.com");
    const tokenB = await registerAndGetToken("bob@example.com");

    const createRes = await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "Alice's private todo" }),
    });
    const created = await createRes.json() as { id: string };

    const deleteRes = await fetch(`${baseUrl}/todos/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(deleteRes.status).toBe(404);
  });
});
