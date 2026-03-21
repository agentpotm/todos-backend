import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { WebSocket } from "ws";
import { db, pool } from "../src/db/client";
import { users, refreshTokens, todos } from "../src/db/schema";
import authRoutes from "../src/routes/auth";
import todosRoutes from "../src/routes/todos";
import { createWsServer } from "../src/ws/server";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);
app.use("/todos", todosRoutes);

let server: http.Server;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  server = http.createServer(app);
  createWsServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
  wsUrl = `ws://localhost:${addr.port}`;
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
  const body = (await res.json()) as { token: string };
  return body.token;
}

function connectWs(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("WS message timeout")),
      5000
    );
    ws.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

describe("WebSocket authentication", () => {
  it("closes connection with code 1008 when no token is provided", async () => {
    const closeCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.on("close", (code) => resolve(code));
      ws.on("error", () => {});
    });
    expect(closeCode).toBe(1008);
  });

  it("closes connection with code 1008 when an invalid token is provided", async () => {
    const closeCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsUrl}?token=invalid-token`);
      ws.on("close", (code) => resolve(code));
      ws.on("error", () => {});
    });
    expect(closeCode).toBe(1008);
  });

  it("accepts connection with a valid token", async () => {
    const token = await registerAndGetToken();
    const ws = await connectWs(token);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});

describe("WebSocket event broadcasts", () => {
  it("broadcasts todo:created event when a todo is created", async () => {
    const token = await registerAndGetToken();
    const ws = await connectWs(token);
    const msgPromise = waitForMessage(ws);

    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Test todo" }),
    });

    const msg = await msgPromise;
    ws.close();

    expect(msg.type).toBe("todo:created");
    expect(msg.payload).toMatchObject({ title: "Test todo", completed: false });
  });

  it("broadcasts todo:updated event when a todo is updated", async () => {
    const token = await registerAndGetToken();

    const createRes = await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Original title" }),
    });
    const created = (await createRes.json()) as { id: string };

    const ws = await connectWs(token);
    const msgPromise = waitForMessage(ws);

    await fetch(`${baseUrl}/todos/${created.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Updated title" }),
    });

    const msg = await msgPromise;
    ws.close();

    expect(msg.type).toBe("todo:updated");
    expect(msg.payload).toMatchObject({ id: created.id, title: "Updated title" });
  });

  it("broadcasts todo:deleted event when a todo is deleted", async () => {
    const token = await registerAndGetToken();

    const createRes = await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "To be deleted" }),
    });
    const created = (await createRes.json()) as { id: string };

    const ws = await connectWs(token);
    const msgPromise = waitForMessage(ws);

    await fetch(`${baseUrl}/todos/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const msg = await msgPromise;
    ws.close();

    expect(msg.type).toBe("todo:deleted");
    expect(msg.payload).toMatchObject({ id: created.id });
  });

  it("broadcasts to all open sessions for the same user", async () => {
    const token = await registerAndGetToken();
    const ws1 = await connectWs(token);
    const ws2 = await connectWs(token);

    const msg1Promise = waitForMessage(ws1);
    const msg2Promise = waitForMessage(ws2);

    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Broadcast to all sessions" }),
    });

    const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);
    ws1.close();
    ws2.close();

    expect(msg1.type).toBe("todo:created");
    expect(msg2.type).toBe("todo:created");
  });

  it("does not broadcast events to other users", async () => {
    const tokenA = await registerAndGetToken("alice@example.com");
    const tokenB = await registerAndGetToken("bob@example.com");

    const wsB = await connectWs(tokenB);
    let bobReceivedMessage = false;
    wsB.on("message", () => {
      bobReceivedMessage = true;
    });

    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "Alice's todo" }),
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    wsB.close();

    expect(bobReceivedMessage).toBe(false);
  });
});
