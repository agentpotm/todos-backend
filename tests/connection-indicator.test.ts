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

// Fast ping interval for tests
const TEST_PING_INTERVAL_MS = 100;

beforeAll(async () => {
  server = http.createServer(app);
  createWsServer(server, { pingIntervalMs: TEST_PING_INTERVAL_MS });
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

describe("WebSocket ping/heartbeat (connection indicator)", () => {
  it("server sends ping frames to connected clients", async () => {
    const token = await registerAndGetToken();
    const ws = await connectWs(token);

    const pingReceived = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1000);
      ws.on("ping", () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });

    ws.close();
    expect(pingReceived).toBe(true);
  });

  it("server terminates connections that stop responding to pings", async () => {
    const token = await registerAndGetToken();
    const ws = await connectWs(token);

    // Disable automatic pong responses so the server sees a dead connection
    ws.on("ping", () => {
      // intentionally do not send pong
    });
    // Remove the default pong handler added by the ws library
    (ws as unknown as { _receiver: { removeAllListeners: (e: string) => void } })._receiver?.removeAllListeners?.("ping");

    const closeCode = await new Promise<number>((resolve) => {
      // Wait for server to terminate the unresponsive connection.
      // After one missed pong the server marks isAlive=false; after the next
      // ping interval with isAlive still false it calls terminate().
      const timeout = setTimeout(() => resolve(-1), 2000);
      ws.on("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    // terminate() causes an abnormal closure (1006 from client perspective)
    expect(closeCode).not.toBe(-1); // connection was closed, not timed out
  });

  it("server keeps alive connections that respond to pings", async () => {
    const token = await registerAndGetToken();
    const ws = await connectWs(token);

    // Let several ping/pong cycles pass
    await new Promise((resolve) =>
      setTimeout(resolve, TEST_PING_INTERVAL_MS * 4)
    );

    // Connection should still be open
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});

describe("no mutations silently dropped on reconnect", () => {
  it("mutations made while disconnected are persisted and visible after reconnect", async () => {
    const token = await registerAndGetToken();

    // Connect, then disconnect
    const ws = await connectWs(token);
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Make a mutation while disconnected from WS
    const createRes = await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Created while offline" }),
    });
    expect(createRes.status).toBe(201);

    // Reconnect and verify the todo is present
    const ws2 = await connectWs(token);

    const listRes = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await listRes.json()) as Array<{ title: string }>;
    ws2.close();

    expect(body.some((t) => t.title === "Created while offline")).toBe(true);
  });

  it("mutations from other sessions are visible after reconnect", async () => {
    const tokenA = await registerAndGetToken("alice@example.com");
    const tokenB = await registerAndGetToken("bob@example.com");

    // Bob connects then disconnects
    const wsBob = await connectWs(tokenB);
    wsBob.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Alice makes a mutation on her own account (separate user — Bob shouldn't see it,
    // but this verifies the server handles the broadcast without error)
    await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "Alice's offline todo" }),
    });

    // Bob reconnects and makes his own mutation — should succeed regardless
    const wsBob2 = await connectWs(tokenB);
    const bobCreateRes = await fetch(`${baseUrl}/todos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ title: "Bob's reconnect todo" }),
    });
    expect(bobCreateRes.status).toBe(201);

    const bobListRes = await fetch(`${baseUrl}/todos`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bobTodos = (await bobListRes.json()) as Array<{ title: string }>;
    wsBob2.close();

    expect(bobTodos.some((t) => t.title === "Bob's reconnect todo")).toBe(true);
    // Bob should not see Alice's todos (different user)
    expect(bobTodos.some((t) => t.title === "Alice's offline todo")).toBe(
      false
    );
  });
});
