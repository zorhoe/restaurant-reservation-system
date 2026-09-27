import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import * as input from "../validators/input.js";
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
export function createAuthService({ store, clock, settings }) {
  const cookie = {
    httpOnly: true,
    secure: settings.production,
    sameSite: "lax",
    path: "/",
  };
  const bad = () => new ApiError(401, "Incorrect email or password.");
  const revoke = async (tx, userId) => {
    for (const session of await tx.list("sessions"))
      if (session.userId === userId) await tx.remove("sessions", session.id);
  };
  async function createUser(tx, body, role = "user") {
    const name = input.text(body.name, "name");
    const email = input.email(body.email);
    const passwordHash = await hashPassword(body.password);
    if ((await tx.list("users")).some((u) => u.email === email))
      throw new ApiError(409, "This email is already registered.");
    return tx.create("users", {
      name,
      email,
      passwordHash,
      role,
      createdAt: clock().toISOString(),
    });
  }
  async function issue(tx, user, res) {
    const iat = Math.floor(clock().getTime() / 1000);
    const session = await tx.create("sessions", {
      userId: user.id,
      expiresAt: new Date((iat + settings.sessionSeconds) * 1000).toISOString(),
    });
    const token = jwt.sign({ sid: session.id, iat }, settings.jwtSecret, {
      algorithm: "HS256",
      subject: user.id,
      issuer: "gather",
      audience: "gather-web",
      expiresIn: settings.sessionSeconds,
    });
    // Set cookie only after the transaction commits (caller invokes returned function).
    return {
      user: publicUser(user),
      commit: () =>
        res.cookie(settings.cookieName, token, {
          ...cookie,
          maxAge: settings.sessionSeconds * 1000,
        }),
    };
  }
  async function authenticate(req) {
    try {
      const token = req.cookies?.[settings.cookieName];
      if (!token) throw new Error();
      const claims = jwt.verify(token, settings.jwtSecret, {
        algorithms: ["HS256"],
        issuer: "gather",
        audience: "gather-web",
        clockTimestamp: Math.floor(clock().getTime() / 1000),
      });
      const session = await store.get("sessions", claims.sid);
      if (
        !session ||
        session.userId !== claims.sub ||
        new Date(session.expiresAt) <= clock()
      )
        throw new Error();
      const user = await store.get("users", claims.sub);
      if (!user) throw new Error();
      return { user: publicUser(user), sessionId: session.id };
    } catch {
      throw new ApiError(401, "Please sign in to continue.");
    }
  }
  return {
    authenticate,
    createUser,
    revoke,
    async register(body, res) {
      input.object(body, ["name", "email", "password"]);
      const result = await store.transaction(async (tx) =>
        issue(tx, await createUser(tx, body), res),
      );
      result.commit();
      return result.user;
    },
    async login(body, res) {
      input.object(body, ["email", "password"]);
      const email = input.email(body.email);
      const result = await store.transaction(async (tx) => {
        const user = (await tx.list("users")).find((u) => u.email === email);
        const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
        const valid = await verifyPassword(
          body.password,
          user?.passwordHash || dummy,
        );
        if (!user || !valid) throw bad();
        return issue(tx, user, res);
      });
      result.commit();
      return result.user;
    },
    async logout(req, res) {
      const token = req.cookies?.[settings.cookieName];
      if (token) {
        try {
          const claims = jwt.verify(token, settings.jwtSecret, {
            algorithms: ["HS256"],
            issuer: "gather",
            audience: "gather-web",
            clockTimestamp: Math.floor(clock().getTime() / 1000),
          });
          await store.transaction((tx) => tx.remove("sessions", claims.sid));
        } catch {
          /* Clear expired or invalid cookies as well. */
        }
      }
      res.clearCookie(settings.cookieName, cookie);
    },
    async updateUser(tx, id, body, { self = false } = {}) {
      input.object(
        body,
        self
          ? ["name", "email", "password", "currentPassword"]
          : ["name", "email", "password", "role"],
      );
      const user = await tx.get("users", id);
      if (!user) throw new ApiError(404, "User not found.");
      const values = {
        name: input.text(body.name ?? user.name, "name"),
        email: input.email(body.email ?? user.email),
        role: self ? user.role : (body.role ?? user.role),
      };
      if (!["user", "admin"].includes(values.role))
        throw new ApiError(400, "Invalid role.");
      if (
        (await tx.list("users")).some(
          (u) => u.id !== id && u.email === values.email,
        )
      )
        throw new ApiError(409, "This email is already registered.");
      const sensitive = Boolean(body.password) || values.email !== user.email;
      if (
        self &&
        sensitive &&
        !(await verifyPassword(body.currentPassword, user.passwordHash))
      )
        throw new ApiError(
          400,
          "Enter your current password to change email or password.",
        );
      if (body.password)
        values.passwordHash = await hashPassword(body.password);
      if (sensitive || values.role !== user.role) await revoke(tx, id);
      return tx.update("users", id, values);
    },
    async profile(req, body, res) {
      const result = await store.transaction(async (tx) => {
        const user = await this.updateUser(tx, req.auth.user.id, body, {
          self: true,
        });
        return issue(tx, user, res);
      });
      result.commit();
      return result.user;
    },
  };
}
