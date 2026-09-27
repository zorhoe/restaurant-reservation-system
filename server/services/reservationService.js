import { ApiError } from '../utils/ApiError.js';
import * as input from '../validators/input.js';

const statuses = ['confirmed', 'cancelled', 'completed'];
const fields = {
  restaurants: ['name', 'address', 'active'],
  tables: ['restaurantId', 'label', 'capacity', 'active'],
  reservations: ['tableId', 'guestName', 'guestEmail', 'guestCount', 'startAt', 'durationMinutes', 'notes', 'status'],
};

export function createReservationService({ store, clock, settings }) {
  const now = () => clock().toISOString();
  const get = (name, id) => {
    const record = store.get(name, id);
    if (!record) throw new ApiError(404, `${name.slice(0, -1)} not found.`);
    return record;
  };
  const conflict = message => { throw new ApiError(409, message); };
  const validateWindow = (startAt, durationMinutes) => {
    const start = new Date(startAt).getTime();
    const current = clock().getTime();
    if (start <= current) input.fail('startAt must be in the future.');
    if (start > current + settings.maxAdvanceDays * 86400000) input.fail(`Bookings may be made at most ${settings.maxAdvanceDays} days ahead.`);
    input.integer(durationMinutes, 'durationMinutes', settings.maxDurationMinutes);
    return new Date(start + durationMinutes * 60000).toISOString();
  };
  const overlaps = (tableId, startAt, endAt, excludedId) => store.list('reservations').some(item =>
    item.id !== excludedId && item.tableId === tableId && item.status === 'confirmed' &&
    item.startAt < endAt && item.endAt > startAt);

  function validate(name, body, existing) {
    input.object(body, fields[name]);
    if (!Object.keys(body).length) input.fail('At least one field is required.');
    const data = { ...existing, ...body };
    if (name === 'restaurants') {
      data.name = input.text(data.name, 'name');
      data.address = input.text(data.address, 'address', 500);
      data.active = input.boolean(data.active === undefined ? true : data.active, 'active');
    } else if (name === 'tables') {
      data.restaurantId = input.text(data.restaurantId, 'restaurantId');
      get('restaurants', data.restaurantId);
      if (existing && data.restaurantId !== existing.restaurantId) input.fail('A table cannot be moved to a different restaurant.');
      data.label = input.text(data.label, 'label', 50);
      data.capacity = input.integer(data.capacity, 'capacity');
      data.active = input.boolean(data.active === undefined ? true : data.active, 'active');
      if (store.list('tables').some(table => table.id !== existing?.id && table.restaurantId === data.restaurantId && table.label.toLowerCase() === data.label.toLowerCase())) {
        conflict('Table labels must be unique within a restaurant.');
      }
      if (store.list('reservations').some(item => item.tableId === existing?.id && item.status === 'confirmed' && item.endAt > now() && item.guestCount > data.capacity)) {
        conflict('Capacity cannot be reduced below an upcoming or ongoing reservation guest count.');
      }
    } else {
      if (existing && existing.status !== 'confirmed') conflict('Cancelled or completed reservations cannot be edited.');
      data.tableId = input.text(data.tableId, 'tableId');
      const table = get('tables', data.tableId);
      const restaurant = get('restaurants', table.restaurantId);
      data.restaurantId = table.restaurantId;
      data.guestName = input.text(data.guestName, 'guestName');
      data.guestEmail = input.email(data.guestEmail);
      data.guestCount = input.integer(data.guestCount, 'guestCount');
      data.startAt = input.instant(data.startAt);
      data.durationMinutes = input.integer(data.durationMinutes === undefined ? settings.defaultDurationMinutes : data.durationMinutes, 'durationMinutes', settings.maxDurationMinutes);
      data.notes = data.notes === undefined ? '' : data.notes;
      if (typeof data.notes !== 'string' || data.notes.length > 1000) input.fail('notes must be a string of at most 1000 characters.');
      data.status = data.status === undefined ? 'confirmed' : data.status;
      if (!statuses.includes(data.status)) input.fail(`status must be one of: ${statuses.join(', ')}.`);
      if (!existing && data.status !== 'confirmed') input.fail('New reservations must be confirmed.');
      const terminal = existing && data.status !== 'confirmed';
      if (terminal) {
        if (Object.keys(body).some(key => key !== 'status')) input.fail('Change status separately from reservation details.');
        if (data.status === 'completed' && existing.endAt > now()) conflict('A reservation can be completed only after its end time.');
      } else {
        if (!table.active || !restaurant.active) conflict('This restaurant or table is not accepting bookings.');
        if (data.guestCount > table.capacity) conflict('Guest count exceeds table capacity.');
        data.endAt = validateWindow(data.startAt, data.durationMinutes);
        if (overlaps(data.tableId, data.startAt, data.endAt, existing?.id)) conflict('This table is already booked during the requested time.');
      }
    }
    return data;
  }

  return {
    get,
    list(name, query) {
      const filters = name === 'reservations' ? ['restaurantId', 'tableId', 'status'] : name === 'tables' ? ['restaurantId'] : [];
      input.object(query, ['page', 'limit', ...filters]);
      const page = input.queryInteger(query.page, 'page', 1, 1000000);
      const limit = input.queryInteger(query.limit, 'limit', 20, 100);
      for (const key of filters) if (query[key] !== undefined) input.text(query[key], key);
      if (query.status && !statuses.includes(query.status)) input.fail('Invalid status filter.');
      const all = store.list(name).filter(item => filters.every(key => query[key] === undefined || item[key] === query[key]));
      return { data: all.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: all.length, pages: Math.ceil(all.length / limit) } };
    },
    create(name, body) {
      const data = validate(name, body);
      return store.create(name, { ...data, createdAt: now(), updatedAt: now() });
    },
    update(name, id, body) {
      const existing = get(name, id);
      const data = validate(name, body, existing);
      return store.update(name, id, { ...data, updatedAt: now() });
    },
    remove(name, id) {
      get(name, id);
      if (name === 'restaurants' && store.list('tables').some(item => item.restaurantId === id)) conflict('Remove this restaurant’s tables first.');
      if (name === 'tables' && store.list('reservations').some(item => item.tableId === id)) conflict('Tables with reservation history cannot be deleted. Deactivate the table instead.');
      if (name === 'reservations') input.fail('Cancel reservations using PATCH to preserve their history.');
      store.remove(name, id);
    },
    availability(query) {
      input.object(query, ['restaurantId', 'startAt', 'durationMinutes', 'guestCount']);
      const restaurantId = input.text(query.restaurantId, 'restaurantId');
      const restaurant = get('restaurants', restaurantId);
      const startAt = input.instant(query.startAt);
      const durationMinutes = input.queryInteger(query.durationMinutes, 'durationMinutes', settings.defaultDurationMinutes, settings.maxDurationMinutes);
      const guestCount = input.queryInteger(query.guestCount, 'guestCount', 1, 1000);
      const endAt = validateWindow(startAt, durationMinutes);
      const data = restaurant.active ? store.list('tables').filter(table => table.restaurantId === restaurantId && table.active && table.capacity >= guestCount && !overlaps(table.id, startAt, endAt)) : [];
      return { data, window: { startAt, endAt, durationMinutes, guestCount } };
    },
  };
}
