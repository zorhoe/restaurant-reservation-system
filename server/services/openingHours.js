import { fail, object } from '../validators/input.js';
export const unrestrictedHours = () => Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, [{ open: '00:00', close: '24:00' }]]));
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export function validateHours(hours) {
  object(hours, ['0', '1', '2', '3', '4', '5', '6']);
  const result = {};
  for (let day = 0; day < 7; day++) {
    const windows = hours[day];
    if (!Array.isArray(windows) || windows.length > 4) fail('Each day requires an array of up to four opening periods.');
    let previous = -1;
    result[day] = windows.map(window => {
      object(window, ['open', 'close']);
      if (typeof window.open !== 'string' || typeof window.close !== 'string' ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.open) ||
          !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(window.close)) fail('Opening hours must use HH:mm times.');
      const start = minutes(window.open), end = minutes(window.close);
      if (start >= end || start < previous) fail('Opening periods must be ordered, non-overlapping, and close after opening on the same day.');
      previous = end;
      return { open: window.open, close: window.close };
    });
  }
  return result;
}
export function assertOpen(restaurant, startAt, endAt) {
  if (!restaurant.openingHours) return; // Older records retain their existing availability until configured.
  // Philippine local calendar, independent of the machine or browser timezone.
  const localStart = new Date(new Date(startAt).getTime() + 8 * 3600000);
  const midnight = Date.UTC(localStart.getUTCFullYear(), localStart.getUTCMonth(), localStart.getUTCDate()) - 8 * 3600000;
  const start = new Date(startAt).getTime(), end = new Date(endAt).getTime();
  const windows = restaurant.openingHours[localStart.getUTCDay()] || [];
  if (!windows.some(window => start >= midnight + minutes(window.open) * 60000 && end <= midnight + minutes(window.close) * 60000))
    fail('The entire reservation must fit within restaurant opening hours (Asia/Manila). Choose an open day and time; bookings cannot cross a service break or closing time.');
}
