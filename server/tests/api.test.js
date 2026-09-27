import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.js';

const settings = { clientOrigin: 'http://localhost:5173', defaultDurationMinutes: 60, maxDurationMinutes: 180, maxAdvanceDays: 30 };
async function fixture(t) {
  let current = new Date('2027-01-01T00:00:00.000Z');
  const server = createApp({ settings, clock: () => current }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const restaurant = (await request('/restaurants', 'POST', { name: 'Test Kitchen', address: 'Manila' })).body.data;
  const table = (await request('/tables', 'POST', { restaurantId: restaurant.id, label: 'T1', capacity: 4 })).body.data;
  const booking = { tableId: table.id, guestName: 'Test Guest', guestEmail: 'guest@example.com', guestCount: 3, startAt: '2027-01-02T10:00:00.000Z' };
  return { request, restaurant, table, booking, advance: value => { current = new Date(value); } };
}

test('health, dynamic config, resource updates, and pagination work without MongoDB', async t => {
  const { request, restaurant } = await fixture(t);
  assert.equal((await request('/health')).body.databaseConnected, false);
  assert.equal((await request('/config')).body.data.defaultDurationMinutes, 60);
  assert.equal((await request(`/restaurants/${restaurant.id}`, 'PATCH', { name: 'Renamed' })).body.data.name, 'Renamed');
  const list = await request('/restaurants?page=1&limit=1');
  assert.equal(list.body.pagination.total, 1);
  assert.equal(list.body.data.length, 1);
  assert.equal((await request('/restaurants?limit=abc')).status, 400);
  assert.equal((await request('/restaurants/missing')).status, 404);
});

test('concurrent overlapping bookings conflict; adjacent bookings succeed', async t => {
  const { request, booking, restaurant } = await fixture(t);
  const attempts = await Promise.all([request('/reservations', 'POST', booking), request('/reservations', 'POST', booking)]);
  assert.deepEqual(attempts.map(item => item.status).sort(), [201, 409]);
  const query = new URLSearchParams({ restaurantId: restaurant.id, startAt: booking.startAt, guestCount: '3' });
  assert.equal((await request(`/availability?${query}`)).body.data.length, 0);
  const adjacent = await request('/reservations', 'POST', { ...booking, startAt: '2027-01-02T11:00:00Z' });
  assert.equal(adjacent.status, 201);
});

test('cancellation releases availability and terminal reservations cannot be edited', async t => {
  const { request, booking, restaurant } = await fixture(t);
  const created = await request('/reservations', 'POST', booking);
  const path = `/reservations/${created.body.data.id}`;
  assert.equal((await request(path, 'PATCH', { status: 'completed' })).status, 409);
  assert.equal((await request(path, 'PATCH', { status: 'cancelled' })).status, 200);
  assert.equal((await request(path, 'PATCH', { status: 'confirmed' })).status, 409);
  const query = new URLSearchParams({ restaurantId: restaurant.id, startAt: booking.startAt });
  assert.equal((await request(`/availability?${query}`)).body.data.length, 1);
  assert.equal((await request('/reservations', 'POST', booking)).status, 201);
});

test('invalid fields, capacity, dates, and booking horizon are rejected', async t => {
  const { request, booking } = await fixture(t);
  for (const patch of [
    { guestCount: 0 }, { guestCount: '3' }, { guestEmail: 'bad' }, { id: 'injected' },
    { startAt: '2027-02-30T10:00:00Z' }, { startAt: '2027-01-02T10:00:00' },
    { startAt: '2026-12-31T10:00:00Z' }, { startAt: '2027-03-01T10:00:00Z' },
    { durationMinutes: 181 }, { durationMinutes: null }, { status: 'completed' },
  ]) assert.equal((await request('/reservations', 'POST', { ...booking, ...patch })).status, 400, JSON.stringify(patch));
  assert.equal((await request('/reservations', 'POST', { ...booking, guestCount: 5 })).status, 409);
  assert.equal((await request('/reservations', 'POST', { ...booking, tableId: 'missing' })).status, 404);
  assert.equal((await request('/restaurants', 'POST', { name: 'A', address: 'B', active: null })).status, 400);
});

test('table uniqueness, capacity updates, and deletion preserve references', async t => {
  const { request, restaurant, table, booking } = await fixture(t);
  assert.equal((await request('/tables', 'POST', { restaurantId: restaurant.id, label: 't1', capacity: 4 })).status, 409);
  assert.equal((await request(`/restaurants/${restaurant.id}`, 'DELETE')).status, 409);
  await request('/reservations', 'POST', booking);
  assert.equal((await request(`/tables/${table.id}`, 'PATCH', { capacity: 2 })).status, 409);
  assert.equal((await request(`/tables/${table.id}`, 'DELETE')).status, 409);
  assert.equal((await request(`/tables/${table.id}`, 'PATCH', { active: false })).status, 200);
  assert.equal((await request('/reservations', 'POST', { ...booking, startAt: '2027-01-03T10:00:00Z' })).status, 409);
});

test('failed reschedule leaves the original booking unchanged; completion requires end time', async t => {
  const { request, booking, advance } = await fixture(t);
  const first = (await request('/reservations', 'POST', booking)).body.data;
  const second = (await request('/reservations', 'POST', { ...booking, startAt: '2027-01-02T12:00:00Z' })).body.data;
  assert.equal((await request(`/reservations/${second.id}`, 'PATCH', { startAt: booking.startAt })).status, 409);
  assert.equal((await request(`/reservations/${second.id}`)).body.data.startAt, second.startAt);
  advance('2027-01-02T11:00:00.000Z');
  assert.equal((await request(`/reservations/${first.id}`, 'PATCH', { status: 'completed' })).status, 200);
});

test('independent app instances do not share temporary data', async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  assert.equal((await second.request(`/restaurants/${first.restaurant.id}`)).status, 404);
  assert.equal((await first.request(`/tables/${first.table.id}`, 'DELETE')).status, 204);
  assert.equal((await first.request(`/restaurants/${first.restaurant.id}`, 'DELETE')).status, 204);
});
