import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users, refreshTokens } from "../db/schema";
import type { JwtPayload } from "../types";

const JWT_SECRET = () => process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_DAYS = 30;

export async function register(email: string, password: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash }).returning();

  const token = issueAccessToken(user.id, user.email);
  const refreshToken = await createRefreshToken(user.id);

  return { user, token, refreshToken };
}

export async function login(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }

  const token = issueAccessToken(user.id, user.email);
  const refreshToken = await createRefreshToken(user.id);

  return { user, token, refreshToken };
}

export async function refreshAccessToken(tokenValue: string) {
  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, tokenValue))
    .limit(1);

  if (!record || record.expiresAt < new Date()) {
    throw Object.assign(new Error("Invalid or expired refresh token"), { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, record.userId)).limit(1);
  if (!user) {
    throw Object.assign(new Error("User not found"), { status: 401 });
  }

  const token = issueAccessToken(user.id, user.email);
  return { token };
}

export async function logout(tokenValue: string) {
  await db.delete(refreshTokens).where(eq(refreshTokens.token, tokenValue));
}

function issueAccessToken(userId: string, email: string): string {
  const payload: JwtPayload = { sub: userId, email };
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: JWT_EXPIRES_IN() } as jwt.SignOptions);
}

async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

  await db.insert(refreshTokens).values({ userId, token, expiresAt });
  return token;
}
