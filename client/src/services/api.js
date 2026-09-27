// Vite injects import.meta.env. The optional chain keeps this module importable
// from plain Node for tests, where only the default relative path applies.
const base = (import.meta.env?.VITE_API_URL || "/api").replace(/\/$/, "");
let user = null,
  settings = null;
export async function request(path, { quiet = false, ...options } = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "Gather",
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Check that npm run dev is running, then retry.",
    );
  }
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401 && !quiet) {
      user = null;
      window.dispatchEvent(new Event("gather:unauthorized"));
    }
    const error = new Error(body?.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return body;
}
const send = (path, method, body) =>
  request(path, { method, body: body ? JSON.stringify(body) : undefined });
async function remember(value) {
  user = value;
  settings = (await request("/config")).data;
  return user;
}
export async function me() {
  try {
    return await remember((await request("/auth/me", { quiet: true })).data);
  } catch (error) {
    if (error.status === 401) {
      user = null;
      return null;
    }
    throw error;
  }
}
export async function login(email, password) {
  return remember(
    (await send("/auth/login", "POST", { email, password })).data,
  );
}
export async function register({ name, email, password }) {
  return remember(
    (await send("/auth/register", "POST", { name, email, password })).data,
  );
}
export async function logout() {
  await send("/auth/logout", "POST");
  user = null;
  settings = null;
}
export const currentUser = () => user;
export const config = () => settings;
export async function profile({ name, email, password, currentPassword }) {
  user = (
    await send("/auth/profile", "PUT", {
      name,
      email,
      ...(password ? { password } : {}),
      ...(currentPassword ? { currentPassword } : {}),
    })
  ).data;
  return user;
}
export async function list(resource) {
  const items = [];
  let page = 1,
    result;
  do {
    result = await request(`/${resource}?limit=100&page=${page++}`);
    items.push(...result.data);
  } while (page <= result.pagination.pages);
  return items;
}
export async function save(resource, data, id) {
  let payload = { ...data };
  if (resource === "tables") payload.capacity = Number(payload.capacity);
  if (resource === "users" && !payload.password) delete payload.password;
  if (resource === "reservations") {
    delete payload.restaurantId;
    delete payload.excludeId;
    payload.guestCount = Number(payload.guestCount);
    payload.durationMinutes = Number(payload.durationMinutes);
  }
  return (
    await send(
      `/${resource}${id ? `/${id}` : ""}`,
      id ? "PUT" : "POST",
      payload,
    )
  ).data;
}
export const remove = (resource, id) => send(`/${resource}/${id}`, "DELETE");
export const status = (id, value) =>
  send(`/reservations/${id}`, "PATCH", { status: value });
export async function availability(data, excludeId) {
  const params = {
    restaurantId: data.restaurantId,
    startAt: data.startAt,
    guestCount: data.guestCount,
    durationMinutes: data.durationMinutes,
    ...(excludeId ? { excludeId } : {}),
  };
  return (await request(`/availability?${new URLSearchParams(params)}`)).data;
}
