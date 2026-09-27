import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

// The browser supplies these; api.js reads them at module scope.
const listeners = {};
globalThis.window = {
  addEventListener: (name, fn) => (listeners[name] = fn),
  removeEventListener() {},
  dispatchEvent: (event) => listeners[event.type]?.(),
  location: { hash: "" },
};
globalThis.document = { visibilityState: "hidden" };

// Node's fetch keeps no cookies, but a browser sends the session cookie on
// every request. This jar stands in in for that browser behaviour. It also
// resolves the relative "/api" base against the server, as the Vite proxy does.
const jar = new Map();
const nativeFetch = globalThis.fetch;
let origin = "";
globalThis.fetch = async (url, options = {}) => {
  const headers = new Headers(options.headers);
  if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  const target = String(url).startsWith("/") ? origin + url : url;
  const response = await nativeFetch(target, { ...options, headers });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  return response;
};

const port = await (async () => {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const p = probe.address().port;
  await new Promise((r) => probe.close(r));
  return p;
})();

// Import after the globals exist so the module picks up our server.
origin = `http://127.0.0.1:${port}`;
const api = await import("../src/services/api.js");

const child = spawn(
  process.execPath,
  [fileURLToPath(new URL("../../server/server.js", import.meta.url))],
  {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      MONGO_URI: "",
      ADMIN_EMAIL: "admin@gather.test",
      ADMIN_PASSWORD: "Admin123!",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
test.after(async () => {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
});
await new Promise((resolve, reject) => {
  let out = "";
  child.once("exit", (c) => reject(new Error(`server exited (${c})`)));
  child.stdout.on("data", (c) => {
    out += c;
    if (out.includes("Server running on")) resolve();
  });
  setTimeout(() => reject(new Error("server did not start")), 15000);
});

test("starts signed out and cannot list any record", async () => {
  assert.equal(await api.me(), null);
  assert.equal(api.currentUser(), null);
  for (const resource of ["restaurants", "tables", "reservations", "users"]) {
    await assert.rejects(api.list(resource), (e) => e.status === 401);
  }
});

test("register signs in, returns a session, and only a Regular User", async () => {
  const user = await api.register({
    name: "Test Guest",
    email: "guest@gather.test",
    password: "Password123!",
  });
  assert.equal(user.role, "user");
  assert.ok(!("passwordHash" in user));
  assert.equal(
    (await api.me()).id,
    user.id,
    "session must persist across calls",
  );
  assert.ok(api.config().maxAdvanceDays, "public config must load");
  await assert.rejects(api.list("users"), (e) => e.status === 403);
});

test("logging out revokes the session for good", async () => {
  await api.login("guest@gather.test", "Password123!");
  assert.ok(await api.me());
  await api.logout();
  assert.equal(await api.me(), null);
  // Reuse a stale token by signing in again is the only way back.
  await assert.rejects(api.list("reservations"), (e) => e.status === 401);
});

test("a bad password does not sign anyone in", async () => {
  await assert.rejects(
    api.login("guest@gather.test", "wrong-password"),
    (e) => e.status === 401,
  );
  assert.equal(await api.me(), null);
});

test("an admin can set up a bookable venue and a guest can reserve it", async () => {
  await api.login("admin@gather.test", "Admin123!");
  const venue = await api.save("restaurants", {
    name: "Garden Kitchen",
    address: "Makati",
  });
  const table = await api.save("tables", {
    restaurantId: venue.id,
    label: "Window 01",
    capacity: 4,
  });
  assert.ok(venue.id && table.id);

  await api.login("guest@gather.test", "Password123!");
  assert.ok(
    (await api.list("restaurants")).some((r) => r.id === venue.id),
    "guests see active venues",
  );
  const startAt = new Date(Date.now() + 86400000).toISOString();
  const query = {
    restaurantId: venue.id,
    tableId: table.id,
    guestCount: 2,
    startAt,
    durationMinutes: 90,
  };
  assert.equal((await api.availability(query)).length, 1);
  const booking = await api.save("reservations", query);
  assert.equal(
    booking.guestEmail,
    "guest@gather.test",
    "guest identity comes from the session",
  );
  assert.equal(
    (await api.availability(query)).length,
    0,
    "the slot is now taken",
  );
  await assert.rejects(
    api.save("reservations", query),
    (e) => e.status === 409,
  );
});

test("a second user cannot see or touch the first user reservation", async () => {
  const startAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const owner = (await api.list("reservations"))[0];
  await api.logout();
  await api.register({
    name: "Other Guest",
    email: "other@gather.test",
    password: "Password123!",
  });
  assert.equal(
    (await api.list("reservations")).length,
    0,
    "ownership filter is server-side",
  );
  // The record must be invisible, not merely forbidden: reads, edits, and
  // deletes by a non-owner must all report it as missing.
  assert.ok(!(await api.list("reservations")).some((r) => r.id === owner.id));
  await assert.rejects(
    api.save("reservations", { notes: "stolen" }, owner.id),
    (e) => e.status === 404,
  );
  await assert.rejects(api.status(owner.id, "cancelled"), (e) => e.status === 404);
  await assert.rejects(api.remove("reservations", owner.id), (e) => e.status === 404);
  await assert.rejects(
    api.availability(
      {
        restaurantId: owner.restaurantId,
        startAt,
        guestCount: 2,
        durationMinutes: 60,
      },
      owner.id,
    ),
    (e) => e.status === 404,
  );
  await assert.rejects(
    api.save("restaurants", { name: "Denied", address: "Denied" }),
    (e) => e.status === 403,
  );
});

test("a guest cannot promote themselves and profile edits keep ownership", async () => {
  await assert.rejects(
    api.profile({
      name: "Renamed",
      email: "renamed@gather.test",
      role: "admin",
    }),
    (e) => e.status === 400,
  );
  const renamed = await api.profile({
    name: "Renamed Guest",
    email: "renamed@gather.test",
    currentPassword: "Password123!",
  });
  assert.equal(renamed.role, "user");
  assert.equal(renamed.name, "Renamed Guest");
  assert.equal(
    (await api.me()).id,
    renamed.id,
    "profile change must not sign the user out",
  );
});
