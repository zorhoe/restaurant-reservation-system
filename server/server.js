import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { security } from "./config/security.js";
import { createStore } from "./repositories/index.js";
import { createAuthService } from "./services/authService.js";
let store;
try {
  store = await createStore();
  // Explicit environment bootstrap only; no demo credentials or public admin signup.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const auth = createAuthService({
      store,
      clock: () => new Date(),
      settings: security,
    });
    await store.transaction(async (tx) => {
      if (!(await tx.list("users")).some((u) => u.role === "admin"))
        await auth.createUser(
          tx,
          {
            name: process.env.ADMIN_NAME || "Administrator",
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD,
          },
          "admin",
        );
    });
  }
  const server = createApp({ store }).listen(env.port, env.host, () => {
    console.log(`Server running on http://${env.host}:${env.port}`);
    console.log(
      store.kind === "memory"
        ? "Memory mode: accounts, sessions, and records reset when the server restarts."
        : "MongoDB storage connected.",
    );
  });
  server.on("error", async (error) => {
    console.error(`HTTP server failed (${error.code || error.name}).`);
    await store.close();
    process.exitCode = 1;
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await store.close();
      clearTimeout(timeout);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error(
    `Startup failed: ${error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[connection string]")}`,
  );
  if (store) await store.close();
  process.exitCode = 1;
}
