import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../types";

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

type TodoEventType = "todo:created" | "todo:updated" | "todo:deleted";

interface TodoEvent {
  type: TodoEventType;
  payload: Record<string, unknown>;
}

let wss: WebSocketServer | null = null;

const DEFAULT_PING_INTERVAL_MS = 30_000;

export function createWsServer(
  server: import("http").Server,
  { pingIntervalMs = DEFAULT_PING_INTERVAL_MS }: { pingIntervalMs?: number } = {}
): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on("connection", (socket: AuthenticatedSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "ws://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(1008, "Missing token");
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      socket.userId = payload.sub;
    } catch {
      socket.close(1008, "Invalid token");
      return;
    }

    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("error", () => {
      // silently handle connection errors
    });
  });

  const heartbeat = setInterval(() => {
    wss!.clients.forEach((client) => {
      const socket = client as AuthenticatedSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, pingIntervalMs);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return wss;
}

export function broadcastToUser(userId: string, event: TodoEvent): void {
  if (!wss) return;

  const message = JSON.stringify(event);

  wss.clients.forEach((client) => {
    const authed = client as AuthenticatedSocket;
    if (authed.userId === userId && authed.readyState === WebSocket.OPEN) {
      authed.send(message);
    }
  });
}
