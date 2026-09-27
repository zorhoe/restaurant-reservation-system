const base = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api"
).replace(/\/$/, "");
export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Start npm run dev, then try again.",
    );
  }
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(body?.message || "Something went wrong. Please try again.");
  return body;
}
export async function listAll(resource) {
  const items = [];
  let page = 1;
  let result;
  do {
    result = await request(`/${resource}?limit=100&page=${page++}`);
    items.push(...result.data);
  } while (page <= result.pagination.pages);
  return items;
}
export const save = (resource, data, id) =>
  request(`/${resource}${id ? `/${id}` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(data),
  });
