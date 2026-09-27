import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { createMemoryStore } from '../repositories/memoryStore.js';
import { createAuthService } from '../services/authService.js';

// A live HTTP server, so cookie handling and header behaviour match the browser.
async function live(t) {
  const store = createMemoryStore();
  const app = createApp({
    store,
    settings: { jwtSecret: 'test-secret-'.repeat(4), clientOrigin: 'http://localhost:5173' },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const jar = new Map();
  const send = async (path, method = 'GET', body, extra = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'Gather' } : {}),
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    const text = await res.text();
    return { status: res.status, setCookie: res.headers.getSetCookie(), body: text ? JSON.parse(text) : null };
  };
  await store.transaction(async (tx) => {
    await createAuthService({ store, clock: () => new Date(), settings: { jwtSecret: 'test-secret-'.repeat(4) } })
      .createUser(tx, { name: 'Admin', email: 'admin@test.com', password: 'Password123!' }, 'admin');
  });
  return { send, jar };
}

test('typing a protected URL while signed out cannot read data', async (t) => {
  const { send } = await live(t);
  for (const path of ['/restaurants', '/tables', '/reservations', '/users', '/auth/me']) {
    assert.equal((await send(path)).status, 401, `expected 401 for ${path}`);
  }
  assert.equal((await send('/restaurants', 'POST', { name: 'X', address: 'Y' })).status, 401);
  // A write with no custom header is stopped by CSRF before it ever reaches a record.
  assert.equal((await send('/reservations/r1', 'DELETE')).status, 403);
});

test('health and booking settings are public but leak no user data', async (t) => {
  const { send } = await live(t);
  assert.equal((await send('/health')).status, 200);
  const config = await send('/config');
  assert.equal(config.status, 200);
  // Public settings must describe the booking rules and nothing about accounts.
  assert.deepEqual(Object.keys(config.body.data).sort(), [
    'defaultDurationMinutes',
    'maxAdvanceDays',
    'maxDurationMinutes',
    'reservationStatuses',
  ]);
});

test('signed out, /auth/logout cannot be used to stay signed in', async (t) => {
  const { send } = await live(t);
  assert.equal((await send('/auth/logout', 'POST', undefined, { 'X-Requested-With': 'Gather' })).status, 204);
  assert.equal((await send('/auth/me')).status, 401);
});

test('GET on logout does not end the session, POST does', async (t) => {
  const { send, jar } = await live(t);
  await send('/auth/login', 'POST', { email: 'admin@test.com', password: 'Password123!' });
  const live_ = jar.get('gather_session');
  assert.ok(live_, 'login must set a session cookie');
  assert.ok((await send('/auth/logout')).status !== 204, 'GET must not clear the session');
  assert.equal((await send('/auth/me')).status, 200);
  assert.equal((await send('/auth/logout', 'POST', undefined, { 'X-Requested-With': 'Gather' })).status, 204);
  assert.equal((await send('/auth/me')).status, 401, 'logout must revoke the session');
  // Replaying the stolen cookie after logout must not resurrect the session.
  jar.set('gather_session', live_);
  assert.equal((await send('/auth/me')).status, 401, 'revoked token must stay revoked');
});

test('session survives a fresh request cycle but not a forged cookie', async (t) => {
  const { send, jar } = await live(t);
  await send('/auth/login', 'POST', { email: 'admin@test.com', password: 'Password123!' });
  const good = jar.get('gather_session');
  jar.set('gather_session', good.slice(0, -3) + 'aaa');
  assert.equal((await send('/auth/me')).status, 401);
  jar.set('gather_session', 'gather_session=' + Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64'));
  assert.equal((await send('/auth/me')).status, 401, 'unsigned payload must never authenticate');
  jar.set('gather_session', good);
  assert.equal((await send('/auth/me')).status, 200);
});

test('cookie flags prevent script access and cross-site sending', async (t) => {
  const { send } = await live(t);
  const res = await send('/auth/login', 'POST', { email: 'admin@test.com', password: 'Password123!' });
  const cookie = res.setCookie.join(';');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.ok(!/Domain=/i.test(cookie), 'cookie must stay host-only');
});

test('registration cannot self-assign an administrator role', async (t) => {
  const { send } = await live(t);
  assert.equal(
    (await send('/auth/register', 'POST', { name: 'E', email: 'e@test.com', password: 'Password123!', role: 'admin' })).status,
    400,
  );
  const ok = await send('/auth/register', 'POST', { name: 'E', email: 'e@test.com', password: 'Password123!' });
  assert.equal(ok.status, 201);
  const me = await send('/auth/me');
  assert.equal(me.status, 200);
  assert.equal((await send('/users')).status, 403, 'a new user must not reach admin routes');
});
