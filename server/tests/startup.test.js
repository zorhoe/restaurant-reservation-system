import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('real server starts and serves health with an empty MongoDB URI', { timeout: 15000 }, async t => {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MONGO_URI: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  });
  await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.once('exit', code => reject(new Error(`Server exited before readiness (${code}).`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('Server running on')) resolve();
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', storage: 'memory', databaseConnected: false });
});
