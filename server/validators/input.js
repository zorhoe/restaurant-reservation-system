import { ApiError } from '../utils/ApiError.js';

export const fail = message => { throw new ApiError(400, message); };
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('A JSON object is required.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unknown field: ${key}.`);
  return value;
}
export function text(value, field, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${field} must be a non-empty string of at most ${max} characters.`);
  return value.trim();
}
export function integer(value, field, max = 1000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(`${field} must be an integer from 1 to ${max}.`);
  return value;
}
export function boolean(value, field) {
  if (typeof value !== 'boolean') fail(`${field} must be true or false.`);
  return value;
}
export function email(value) {
  const result = text(value, 'guestEmail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('guestEmail must be a valid email address.');
  return result;
}
export function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    fail('startAt must be a UTC ISO timestamp, for example 2027-01-10T10:00:00.000Z.');
  }
  const parsed = new Date(value);
  const normalized = value.length === 20 ? value.replace('Z', '.000Z') : value;
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) fail('startAt must be a real calendar date and time.');
  return parsed.toISOString();
}
export function queryInteger(value, field, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) fail(`${field} must be a positive integer.`);
  return integer(Number(value), field, max);
}
