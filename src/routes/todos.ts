import { Router, Request, Response } from "express";
import { z } from "zod";
import * as todosService from "../services/todos";
import { authMiddleware } from "../middleware/auth";
import { broadcastToUser } from "../ws/server";
import type { JwtPayload } from "../types";

const router = Router();

router.use(authMiddleware);

function userId(req: Request): string {
  return (req as Request & { user: JwtPayload }).user.sub;
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const items = await todosService.listTodos(userId(req));
    res.json(items);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return;
  }

  try {
    const todo = await todosService.createTodo(userId(req), result.data.title);
    res.status(201).json(todo);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const result = updateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return;
  }

  try {
    const todo = await todosService.updateTodo(userId(req), String(req.params.id), result.data);
    broadcastToUser(userId(req), { type: "todo:updated", payload: todo });
    res.json(todo);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await todosService.deleteTodo(userId(req), String(req.params.id));
    res.status(204).send();
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

export default router;
