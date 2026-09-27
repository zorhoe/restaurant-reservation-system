// Frontend-only adapter. Nothing here is a security boundary or a database.
// State lives in this tab's memory and resets on reload. Replace with api.js
// plus real authentication/ownership endpoints when backend integration resumes.
const clone = (value) => structuredClone(value);
const settings = {
  defaultDurationMinutes: 90,
  maxDurationMinutes: 240,
  maxAdvanceDays: 90,
};
const db = {
  restaurants: [
    {
      id: "venue-demo",
      name: "The Garden Kitchen",
      address: "Makati, Metro Manila",
      active: true,
    },
  ],
  tables: [
    {
      id: "table-demo",
      restaurantId: "venue-demo",
      label: "Window 01",
      capacity: 4,
      active: true,
    },
  ],
  reservations: [],
  users: [],
};
let sessionId = null;
const credentials = new Map();
const fail = (message) => {
  throw new Error(message);
};
const clean = (value, label, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const email = (value) => {
  const result = clean(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail("Enter a valid email address.");
  return result;
};
const count = (value, label, max = 1000) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    fail(`${label} must be between 1 and ${max}.`);
  return n;
};
async function passwordRecord(password, salt = crypto.randomUUID()) {
  if (typeof password !== "string" || password.length < 8)
    fail("Use a password with at least 8 characters.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return {
    salt,
    hash: Array.from(new Uint8Array(bits), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
async function addUser(data, role = "user") {
  const name = clean(data.name, "Name"),
    address = email(data.email);
  if (db.users.some((u) => u.email === address))
    fail("An account with this email already exists.");
  const credential = await passwordRecord(data.password);
  // Check again after password work to keep concurrent registrations unique.
  if (db.users.some((u) => u.email === address))
    fail("An account with this email already exists.");
  const user = { id: crypto.randomUUID(), name, email: address, role };
  db.users.push(user);
  credentials.set(user.id, credential);
  return clone(user);
}
const ready = Promise.all([
  addUser(
    {
      name: "Preview Administrator",
      email: "admin@example.com",
      password: "Admin123!",
    },
    "admin",
  ),
  addUser({
    name: "Preview Guest",
    email: "guest@example.com",
    password: "Guest123!",
  }),
]);
function actor() {
  const user = db.users.find((u) => u.id === sessionId);
  if (!user) fail("Please sign in.");
  return user;
}
function admin() {
  const user = actor();
  if (user.role !== "admin")
    fail("This action is available to administrators only.");
  return user;
}
function get(resource, id) {
  const item = db[resource]?.find((r) => r.id === id);
  if (!item) fail("This record no longer exists.");
  return item;
}
function own(record) {
  const user = actor();
  if (user.role !== "admin" && record.userId !== user.id)
    fail("You can only manage your own reservations.");
  return user;
}
export async function login(address, password) {
  await ready;
  const user = db.users.find(
    (u) => u.email === String(address).trim().toLowerCase(),
  );
  if (!user) fail("Incorrect email or password.");
  const stored = credentials.get(user.id);
  const attempt = await passwordRecord(password, stored.salt);
  if (attempt.hash !== stored.hash) fail("Incorrect email or password.");
  sessionId = user.id;
  return clone(user);
}
export async function register(data) {
  await ready;
  const user = await addUser(data);
  sessionId = user.id;
  return user;
}
export function logout() {
  sessionId = null;
}
export function currentUser() {
  return sessionId ? clone(db.users.find((u) => u.id === sessionId)) : null;
}
export async function profile(data) {
  const user = actor();
  return updateUser(user.id, data, true);
}
async function updateUser(id, data, self = false) {
  if (!self) admin();
  const user = get("users", id);
  const name = clean(data.name, "Name"),
    address = email(data.email);
  if (db.users.some((u) => u.id !== id && u.email === address))
    fail("This email is already in use.");
  const role = self ? user.role : data.role;
  if (!["admin", "user"].includes(role)) fail("Select a valid role.");
  if (id === sessionId && role !== user.role)
    fail("You cannot change your own role.");
  const credential = data.password ? await passwordRecord(data.password) : null;
  Object.assign(user, { name, email: address, role });
  if (credential) credentials.set(id, credential);
  return clone(user);
}
export async function list(resource) {
  await ready;
  const user = actor();
  if (resource === "users") admin();
  let records = db[resource];
  if (!records) fail("Unknown resource.");
  if (user.role !== "admin") {
    if (resource === "reservations")
      records = records.filter((r) => r.userId === user.id);
    if (resource === "restaurants")
      records = records.filter(
        (r) =>
          r.active ||
          db.reservations.some(
            (booking) =>
              booking.userId === user.id && booking.restaurantId === r.id,
          ),
      );
    if (resource === "tables")
      records = records.filter(
        (r) =>
          (r.active && get("restaurants", r.restaurantId).active) ||
          db.reservations.some(
            (booking) => booking.userId === user.id && booking.tableId === r.id,
          ),
      );
  }
  return clone(records);
}
export function config() {
  return clone(settings);
}
function windowFor(data) {
  const start = new Date(data.startAt);
  if (!Number.isFinite(start.getTime()) || start <= new Date())
    fail("Choose a future date and time.");
  if (start.getTime() > Date.now() + settings.maxAdvanceDays * 86400000)
    fail(`Book no more than ${settings.maxAdvanceDays} days ahead.`);
  const duration = count(
    data.durationMinutes,
    "Duration",
    settings.maxDurationMinutes,
  );
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + duration * 60000).toISOString(),
    durationMinutes: duration,
  };
}
function overlap(tableId, window, id) {
  return db.reservations.some(
    (r) =>
      r.id !== id &&
      r.tableId === tableId &&
      r.status === "confirmed" &&
      r.startAt < window.endAt &&
      r.endAt > window.startAt,
  );
}
export async function availability(data, excludeId) {
  actor();
  if (excludeId) own(get("reservations", excludeId));
  const venue = get("restaurants", data.restaurantId);
  const window = windowFor(data);
  const guests = count(data.guestCount, "Guest count");
  return clone(
    db.tables.filter(
      (t) =>
        venue.active &&
        t.restaurantId === venue.id &&
        t.active &&
        t.capacity >= guests &&
        !overlap(t.id, window, excludeId),
    ),
  );
}
export async function save(resource, data, id) {
  await ready;
  const user = actor();
  const existing = id ? get(resource, id) : null;
  if (resource === "users") {
    admin();
    return id
      ? updateUser(id, data)
      : addUser(data, data.role === "admin" ? "admin" : "user");
  }
  let values;
  if (resource === "restaurants") {
    admin();
    values = {
      name: clean(data.name, "Restaurant name"),
      address: clean(data.address, "Address", 500),
      active: data.active !== false,
    };
  } else if (resource === "tables") {
    admin();
    const restaurantId = existing?.restaurantId || data.restaurantId;
    get("restaurants", restaurantId);
    const label = clean(data.label, "Table label", 50),
      capacity = count(data.capacity, "Capacity");
    if (
      db.tables.some(
        (t) =>
          t.id !== id &&
          t.restaurantId === restaurantId &&
          t.label.toLowerCase() === label.toLowerCase(),
      )
    )
      fail("Table labels must be unique within a restaurant.");
    if (
      db.reservations.some(
        (r) =>
          r.tableId === id &&
          r.status === "confirmed" &&
          r.endAt > new Date().toISOString() &&
          r.guestCount > capacity,
      )
    )
      fail("This capacity is too small for an existing reservation.");
    values = { restaurantId, label, capacity, active: data.active !== false };
  } else if (resource === "reservations") {
    if (existing) {
      own(existing);
      if (existing.status !== "confirmed")
        fail("Only confirmed reservations can be edited.");
    }
    const table = get("tables", data.tableId);
    const venue = get("restaurants", table.restaurantId);
    if (!table.active || !venue.active)
      fail("This table is not accepting reservations.");
    const guestCount = count(data.guestCount, "Guest count");
    if (guestCount > table.capacity)
      fail("This table is too small for your party.");
    const window = windowFor(data);
    if (overlap(table.id, window, id))
      fail("This table is already booked at that time.");
    values = {
      ...window,
      tableId: table.id,
      restaurantId: table.restaurantId,
      userId: existing?.userId || user.id,
      guestName:
        user.role === "user" ? user.name : clean(data.guestName, "Guest name"),
      guestEmail: user.role === "user" ? user.email : email(data.guestEmail),
      guestCount,
      notes: String(data.notes || "").slice(0, 1000),
      status: "confirmed",
    };
  } else fail("Unknown resource.");
  if (existing) {
    Object.assign(existing, values, { updatedAt: new Date().toISOString() });
    return clone(existing);
  }
  const record = {
    ...values,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db[resource].push(record);
  return clone(record);
}
export async function status(id, value) {
  const record = get("reservations", id);
  const user = own(record);
  if (record.status !== "confirmed")
    fail("This reservation is already closed.");
  if (!["cancelled", "completed"].includes(value)) fail("Invalid status.");
  if (value === "completed") {
    if (user.role !== "admin")
      fail("Only an administrator can complete reservations.");
    if (new Date(record.endAt) > new Date())
      fail("Complete a reservation after its end time.");
  }
  record.status = value;
  return clone(record);
}
export async function remove(resource, id) {
  const record = get(resource, id);
  if (resource === "reservations") own(record);
  else admin();
  if (resource === "users" && id === sessionId)
    fail("You cannot delete your own account.");
  if (resource === "users" && db.reservations.some((r) => r.userId === id))
    fail("Delete this user’s reservations first.");
  if (
    resource === "restaurants" &&
    db.tables.some((t) => t.restaurantId === id)
  )
    fail("Remove this restaurant’s tables first.");
  if (resource === "tables" && db.reservations.some((r) => r.tableId === id))
    fail("Remove reservations for this table first, or deactivate it.");
  db[resource] = db[resource].filter((r) => r.id !== id);
  if (resource === "users") credentials.delete(id);
}
