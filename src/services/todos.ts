import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { todos } from "../db/schema";
import type { NewTodo } from "../db/schema";

export async function listTodos(userId: string) {
  return db.select().from(todos).where(eq(todos.userId, userId));
}

export async function createTodo(userId: string, title: string) {
  const [todo] = await db.insert(todos).values({ userId, title }).returning();
  return todo;
}

export async function updateTodo(
  userId: string,
  todoId: string,
  updates: Partial<Pick<NewTodo, "title" | "completed">>
) {
  const [todo] = await db
    .update(todos)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .returning();

  if (!todo) {
    throw Object.assign(new Error("Todo not found"), { status: 404 });
  }

  return todo;
}

export async function deleteTodo(userId: string, todoId: string) {
  const [todo] = await db
    .delete(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .returning();

  if (!todo) {
    throw Object.assign(new Error("Todo not found"), { status: 404 });
  }

  return todo;
}
