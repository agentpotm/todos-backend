import { Router, Request, Response } from "express";
import { z } from "zod";
import * as authService from "../services/auth";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/auth",
  });
}

router.post("/register", async (req: Request, res: Response) => {
  const result = credentialsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return;
  }

  try {
    const { token, refreshToken } = await authService.register(
      result.data.email,
      result.data.password
    );
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ token });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const result = credentialsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return;
  }

  try {
    const { token, refreshToken } = await authService.login(
      result.data.email,
      result.data.password
    );
    setRefreshCookie(res, refreshToken);
    res.json({ token });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;

  if (!refreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  try {
    const { token } = await authService.refreshAccessToken(refreshToken);
    res.json({ token });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;

  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  res.clearCookie("refreshToken", { path: "/auth" });
  res.status(204).send();
});

export default router;
