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
import { users, refreshTokens } from "../src/db/schema";
import authRoutes from "../src/routes/auth";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);

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
  await db.delete(refreshTokens);
  await db.delete(users);
});

describe("POST /auth/register", () => {
  it("returns 201 with JWT token on successful registration", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "newuser@example.com",
        password: "securepassword",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("sets httpOnly refresh token cookie on successful registration", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "cookieuser@example.com",
        password: "securepassword",
      }),
    });

    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("returns 400 when password is shorter than 8 characters", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "short" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-a-valid-email",
        password: "securepassword",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when email is missing", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "securepassword" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 409 on duplicate email registration", async () => {
    const credentials = {
      email: "duplicate@example.com",
      password: "securepassword",
    };

    const first = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    expect(first.status).toBe(201);

    const second = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body).toHaveProperty("error");
  });

  it("stores a hashed password (not plaintext) in the database", async () => {
    const password = "securepassword";
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "hashcheck@example.com", password }),
    });

    const [user] = await db.select().from(users).limit(1);
    expect(user).toBeDefined();
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
  });
});
