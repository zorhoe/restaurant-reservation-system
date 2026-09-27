import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { ApiError } from "./ApiError.js";
const scrypt = promisify(scryptCallback);
export function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128)
    throw new ApiError(400, "Password must contain 8–128 characters.");
}
export async function hashPassword(value) {
  validatePassword(value);
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(value, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(value, stored) {
  if (typeof value !== "string" || value.length > 128) return false;
  const [salt, encoded] = stored.split(":");
  const actual = await scrypt(value, salt, 64);
  const expected = Buffer.from(encoded, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
