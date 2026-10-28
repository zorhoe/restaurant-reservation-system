import { createReservationService } from "./reservationService.js";
import { publicUser } from "./authService.js";
import { ApiError } from "../utils/ApiError.js";
import * as input from "../validators/input.js";
export function createAccessService({ store, clock, settings, auth, user }) {
  const domain = createReservationService({ store, clock, settings });
  const requireAdmin = () => {
    if (user.role !== "admin")
      throw new ApiError(403, "Administrator access is required.");
  };
  const own = (r) => {
    if (user.role !== "admin" && r.userId !== user.id)
      throw new ApiError(404, "Reservation not found.");
  };
  async function visible(name) {
    let data = await store.list(name);
    if (name === "users") {
      requireAdmin();
      return data.map(publicUser);
    }
    if (user.role === "admin") return data;
    if (name === "reservations")
      return data.filter((r) => r.userId === user.id);
    const owned = (await store.list("reservations")).filter(
      (r) => r.userId === user.id,
    );
    if (name === "restaurants")
      return data.filter(
        (r) => r.active || owned.some((b) => b.restaurantId === r.id),
      );
    if (name === "tables") {
      const venues = await store.list("restaurants");
      return data.filter(
        (t) =>
          (t.active &&
            venues.some((r) => r.id === t.restaurantId && r.active)) ||
          owned.some((b) => b.tableId === t.id),
      );
    }
    throw new ApiError(404, "Not found.");
  }
  return {
    async list(name, query) {
      const filters =
        name === "reservations"
          ? ["restaurantId", "tableId", "status"]
          : name === "tables"
            ? ["restaurantId"]
            : [];
      input.object(query, ["page", "limit", ...filters]);
      const page = input.queryInteger(query.page, "page", 1, 1000000);
      const limit = input.queryInteger(query.limit, "limit", 20, 100);
      for (const key of filters)
        if (query[key] !== undefined) input.text(query[key], key);
      if (
        query.status &&
        !["confirmed", "cancelled", "completed"].includes(query.status)
      )
        input.fail("Invalid status.");
      const all = (await visible(name)).filter((r) =>
        filters.every(
          (key) => query[key] === undefined || r[key] === query[key],
        ),
      );
      return {
        data: all.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: all.length,
          pages: Math.ceil(all.length / limit),
        },
      };
    },
    async get(name, id) {
      const record = (await visible(name)).find((r) => r.id === id);
      if (!record) throw new ApiError(404, "Record not found.");
      return record;
    },
    async create(name, body) {
      if (name === "users") {
        requireAdmin();
        input.object(body, ["name", "email", "password", "role"]);
        if (body.role && !["user", "admin"].includes(body.role))
          input.fail("Invalid role.");
        return publicUser(
          await auth.createUser(store, body, body.role || "user"),
        );
      }
      if (name !== "reservations") {
        requireAdmin();
        return domain.create(name, body);
      }
      input.object(body, [
        "tableId",
        "guestName",
        "guestEmail",
        "guestCount",
        "startAt",
        "durationMinutes",
        "notes",
        "status",
      ]);
      const values =
        user.role === "user"
          ? { ...body, guestName: user.name, guestEmail: user.email }
          : body;
      return domain.create(name, values, user.id);
    },
    async update(name, id, body) {
      if (name === "users") {
        requireAdmin();
        if (id === user.id && body.role && body.role !== user.role)
          input.fail("You cannot change your own role.");
        return publicUser(await auth.updateUser(store, id, body));
      }
      if (name !== "reservations") {
        requireAdmin();
        return domain.update(name, id, body);
      }
      const record = await domain.get(name, id);
      own(record);
      if (user.role !== "admin" && body.status === "completed")
        throw new ApiError(
          403,
          "Only administrators can complete reservations.",
        );
      input.object(body, [
        "tableId",
        "guestName",
        "guestEmail",
        "guestCount",
        "startAt",
        "durationMinutes",
        "notes",
        "status",
      ]);
      const statusOnly = Object.keys(body).length === 1 && body.status;
      return domain.update(
        name,
        id,
        user.role === "user" && !statusOnly
          ? { ...body, guestName: user.name, guestEmail: user.email }
          : body,
      );
    },
    async remove(name, id) {
      if (name === "reservations") {
        own(await domain.get(name, id));
        return store.remove(name, id);
      }
      requireAdmin();
      if (name === "users") {
        if (id === user.id) input.fail("You cannot delete your own account.");
        if (!(await store.get("users", id)))
          throw new ApiError(404, "User not found.");
        if ((await store.list("reservations")).some((r) => r.userId === id))
          throw new ApiError(409, "Remove this user’s reservations first.");
        await auth.revoke(store, id);
        return store.remove(name, id);
      }
      return domain.remove(name, id);
    },
    async availability(query) {
      if (query.excludeId) {
        input.text(query.excludeId, "excludeId");
        own(await domain.get("reservations", query.excludeId));
      }
      return domain.availability(query);
    },
  };
}

