import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../src/services/preview.js";

test("frontend preview covers accounts, ownership, roles and record CRUD", async () => {
  await assert.rejects(api.list("users"), /sign in/i);
  await assert.rejects(
    api.login("admin@example.com", "incorrect-password"),
    /incorrect/i,
  );
  const admin = await api.login("admin@example.com", "Admin123!");
  assert.equal(admin.role, "admin");
  const venue = await api.save("restaurants", {
    name: "Test Venue",
    address: "Manila",
    active: true,
  });
  const table = await api.save("tables", {
    restaurantId: venue.id,
    label: "T1",
    capacity: 4,
    active: true,
  });
  assert.equal(
    (
      await api.save(
        "restaurants",
        { name: "Updated Venue", address: "Makati", active: true },
        venue.id,
      )
    ).name,
    "Updated Venue",
  );
  assert.equal(
    (
      await api.save(
        "tables",
        { label: "T2", capacity: 6, active: true },
        table.id,
      )
    ).capacity,
    6,
  );
  await assert.rejects(api.remove("restaurants", venue.id), /tables first/i);
  await assert.rejects(api.remove("users", admin.id), /own account/i);
  api.logout();
  const user = await api.register({
    name: "Test User",
    email: "test@example.com",
    password: "Test123!",
    role: "admin",
  });
  assert.equal(user.role, "user", "Registration cannot create an admin");
  await assert.rejects(api.list("users"), /administrators/i);
  await assert.rejects(
    api.save("restaurants", { name: "Denied", address: "Denied" }),
    /administrators/i,
  );
  const body = {
    tableId: table.id,
    restaurantId: venue.id,
    guestCount: 2,
    startAt: new Date(Date.now() + 86400000).toISOString(),
    durationMinutes: 90,
    notes: "Window seat",
  };
  const booking = await api.save("reservations", body);
  assert.equal(booking.userId, user.id);
  assert.equal(booking.guestEmail, user.email);
  await assert.rejects(api.save("reservations", body), /already booked/i);
  assert.equal((await api.availability(body)).length, 0);
  assert.equal((await api.availability(body, booking.id)).length, 1);
  const edited = await api.save(
    "reservations",
    { ...body, guestCount: 3 },
    booking.id,
  );
  assert.equal(edited.guestCount, 3);
  await api.profile({
    name: "Renamed User",
    email: "new@example.com",
    password: "Changed123!",
  });
  assert.equal(
    (await api.list("reservations"))[0].id,
    booking.id,
    "Ownership survives email changes",
  );
  api.logout();
  const second = await api.register({
    name: "Second User",
    email: "second@example.com",
    password: "Second123!",
  });
  assert.equal((await api.list("reservations")).length, 0);
  await assert.rejects(
    api.remove("reservations", booking.id),
    /own reservations/i,
  );
  await assert.rejects(
    api.save("reservations", body, booking.id),
    /own reservations/i,
  );
  await assert.rejects(
    api.register({
      name: "Duplicate",
      email: "second@example.com",
      password: "Second123!",
    }),
    /already exists/i,
  );
  api.logout();
  await api.login("new@example.com", "Changed123!");
  await api.status(booking.id, "cancelled");
  assert.equal((await api.availability(body)).length, 1);
  await api.remove("reservations", booking.id);
  assert.equal((await api.list("reservations")).length, 0);
  api.logout();
  await api.login("admin@example.com", "Admin123!");
  await api.save(
    "users",
    { name: "Second Admin", email: second.email, role: "admin" },
    second.id,
  );
  assert.equal(
    (await api.list("users")).find((u) => u.id === second.id).role,
    "admin",
  );
  await api.remove("users", second.id);
  await api.remove("tables", table.id);
  await api.remove("restaurants", venue.id);
  assert.ok(!(await api.list("restaurants")).some((r) => r.id === venue.id));
  api.logout();
});
