import { execSync } from "child_process";
import { Pool } from "pg";

export async function setup() {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/todos_test";

  // Ensure the test database exists
  const url = new URL(connectionString);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  try {
    await adminPool.query(
      `CREATE DATABASE "${dbName}" TEMPLATE template0`
    );
  } catch (err: unknown) {
    // Database already exists — that's fine
    const pg = err as { code?: string };
    if (pg.code !== "42P04") throw err;
  } finally {
    await adminPool.end();
  }

  // Push schema to test database using drizzle-kit
  execSync(`npx drizzle-kit push --force`, {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "inherit",
  });
}
