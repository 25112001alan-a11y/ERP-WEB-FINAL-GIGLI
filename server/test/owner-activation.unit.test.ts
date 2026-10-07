import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

test('anonymous owner activation validates and conditionally consumes the invitation without a database', async () => {
  const token = 'ab'.repeat(32);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const password = 'owner-chosen-password';
  const pendingHash = await bcrypt.hash('unusable-random-password', 10);
  const invitation = {
    id: 7, tokenHash, companyId: 11, userId: 13,
    user: { companyId: 11 }, consumedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  const user = {
    id: 13, companyId: 11, email: 'invited@example.test', status: 'Pendiente',
    passwordHash: pendingHash, lockedUntil: null, failedAttempts: 0,
  };
  let forceClaimFailure = false;
  let forceUserFailure = false;
  const lookup = mock.fn(async ({ where, select }: { where: { tokenHash: string }; select: Record<string, unknown> }) => {
    assert.deepEqual(select.user, { select: { companyId: true } });
    return where.tokenHash === tokenHash ? invitation : null;
  });
  const claim = mock.fn(async ({ where, data }: {
    where: { id: number; tokenHash: string; consumedAt: null; expiresAt: { gt: Date } };
    data: { consumedAt: Date };
  }) => {
    assert.deepEqual({ ...where, expiresAt: undefined }, {
      id: 7, tokenHash, consumedAt: null, expiresAt: undefined,
    });
    assert.ok(where.expiresAt.gt instanceof Date);
    if (forceClaimFailure || invitation.consumedAt || invitation.expiresAt <= where.expiresAt.gt) return { count: 0 };
    invitation.consumedAt = data.consumedAt;
    return { count: 1 };
  });
  const activate = mock.fn(async ({ where, data }: {
    where: { id: number; companyId: number; status: string };
    data: { passwordHash: string; status: string };
  }) => {
    assert.deepEqual(where, { id: 13, companyId: 11, status: 'Pendiente' });
    assert.equal(data.status, 'Activo');
    assert.match(data.passwordHash, /^\$2[aby]\$/);
    if (forceUserFailure || user.status !== where.status || user.companyId !== where.companyId) return { count: 0 };
    user.passwordHash = data.passwordHash;
    user.status = data.status;
    return { count: 1 };
  });
  const transaction = mock.fn(async (fn: (tx: object) => Promise<void>) => {
    const before = { consumedAt: invitation.consumedAt, passwordHash: user.passwordHash, status: user.status };
    try {
      await fn({ ownerInvitation: { updateMany: claim }, user: { updateMany: activate } });
    } catch (error) {
      // Simulate Prisma rollback; real database atomicity remains unverified.
      invitation.consumedAt = before.consumedAt;
      user.passwordHash = before.passwordHash;
      user.status = before.status;
      throw error;
    }
  });
  const loginLookup = mock.fn(async () => user);
  const stubs: [object, string, Function][] = [
    [prisma.ownerInvitation, 'findUnique', lookup],
    [prisma, '$transaction', transaction],
    [prisma.user, 'findUnique', loginLookup],
  ];
  for (const [delegate, method, fn] of stubs) Object.defineProperty(delegate, method, { value: fn, configurable: true });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
    const post = (body: object) => fetch(`${base}/activate-owner`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const invalid = async (response: Response) => {
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'Invitación inválida' });
    };
    const login = () => fetch(`${base}/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });

    user.passwordHash = await bcrypt.hash(password, 10);
    const pendingLogin = await login();
    assert.equal(pendingLogin.status, 403);
    assert.ok(!JSON.stringify(await pendingLogin.json()).includes('token'));
    user.passwordHash = pendingHash;
    for (const body of [
      { token: 'bad', password }, { token: 42, password }, { token, password: 'short' },
      { token, password: 'x'.repeat(101) }, { token, password, extra: 'no' },
    ]) await invalid(await post(body));
    assert.equal(lookup.mock.callCount(), 0);
    const get = await fetch(`${base}/activate-owner?token=${token}`);
    assert.equal(get.status, 404);
    assert.equal(get.headers.get('cache-control'), 'no-store');
    await invalid(await post({ token: 'cd'.repeat(32), password }));
    const badJson = await fetch(`${base}/activate-owner`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.headers.get('cache-control'), 'no-store');

    invitation.user.companyId = 99;
    await invalid(await post({ token, password }));
    invitation.user.companyId = 11;
    assert.equal(transaction.mock.callCount(), 0);

    invitation.expiresAt = new Date(Date.now() - 1000);
    await invalid(await post({ token, password }));
    invitation.expiresAt = new Date(Date.now() + 60_000);
    assert.equal(transaction.mock.callCount(), 0);

    forceClaimFailure = true;
    await invalid(await post({ token, password }));
    forceClaimFailure = false;
    assert.equal(activate.mock.callCount(), 0);
    assert.equal(invitation.consumedAt, null);

    forceUserFailure = true;
    await invalid(await post({ token, password }));
    forceUserFailure = false;
    assert.equal(invitation.consumedAt, null);
    assert.equal(user.status, 'Pendiente');

    const success = await post({ token, password });
    assert.equal(success.status, 200);
    assert.equal(success.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await success.json(), { ok: true });
    assert.equal(user.status, 'Activo');
    assert.equal(await bcrypt.compare(password, user.passwordHash), true);
    assert.ok(invitation.consumedAt);
    await invalid(await post({ token, password }));
    assert.equal(transaction.mock.callCount(), 3);

    process.env.RATE_LIMIT_DISABLED = 'false';
    try {
      for (let attempt = 0; attempt < 5; attempt++) await invalid(await post({ token: 'bad', password }));
      const limited = await post({ token: 'bad', password });
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('cache-control'), 'no-store');
    } finally {
      process.env.RATE_LIMIT_DISABLED = 'true';
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    for (const [delegate, method] of stubs) Reflect.deleteProperty(delegate, method);
  }
});
