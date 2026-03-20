import "dotenv/config";
import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { createWsServer } from "./ws/server";
import authRoutes from "./routes/auth";
import todosRoutes from "./routes/todos";

const app = express();

app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/todos", todosRoutes);

const server = http.createServer(app);
createWsServer(server);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export { app, server };
