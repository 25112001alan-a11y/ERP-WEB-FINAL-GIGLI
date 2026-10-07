import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

// This file is intentionally outside test/*.test.ts. Fail before importing app or Prisma.
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.ECO_DISPOSABLE_DB !== 'nexus_eco_ci_disposable' ||
    process.env.DOTENV_CONFIG_PATH !== '/dev/null' ||
    process.env.DATABASE_URL !== 'mysql://root:eco-ci-only@mysql:3306/nexus_eco_ci_disposable') {
  throw new Error('ECO integration requires its isolated CI MySQL service');
}

test('deployed ECO migrations enforce FKs and the owner lifecycle is atomic', async () => {
  const [{ app }, { prisma }, { default: bcrypt }] = await Promise.all([
    import('../src/app.js'), import('../src/lib/prisma.js'), import('bcryptjs'),
  ]);
  const suffix = randomUUID().replaceAll('-', '');
  const email = `eco-${suffix}@example.test`;
  const password = `owner-${suffix}`;
  const platformPassword = `platform-${suffix}`;
  const platformUser = await prisma.platformUser.create({
    data: { email: `platform-${suffix}@example.test`, passwordHash: await bcrypt.hash(platformPassword, 10) },
  });
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = async (path: string, body: object, token?: string, method = 'POST') => {
      const response = await fetch(`${base}${path}`, {
        method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    // Authenticate the fixture through the real route (no seeded or existing accounts).
    const login = await request('/api/platform/login', { email: platformUser.email, password: platformPassword });
    assert.equal(login.status, 200);
    const auth = (login.body as { token: string }).token;

    const payload = { companyName: `ECO Fixture ${suffix}`, firstName: 'Test', lastName: 'Owner', email };
    const created = await request('/api/platform/companies', payload, auth);
    assert.equal(created.status, 201);
    const { company, owner, invitationToken } = created.body as {
      company: { id: number }; owner: { id: number; status: string }; invitationToken: string;
    };
    assert.equal(owner.status, 'Pendiente');
    assert.equal(/^[a-f0-9]{64}$/.test(invitationToken), true);
    const invitation = await prisma.ownerInvitation.findUniqueOrThrow({ where: { userId: owner.id } });
    assert.equal(invitation.companyId, company.id);
    assert.equal(invitation.platformUserId, platformUser.id);
    assert.equal(invitation.tokenHash, createHash('sha256').update(invitationToken).digest('hex'));
    assert.equal((await prisma.platformAuditEvent.findMany({ where: { targetCompanyId: company.id } }))[0]?.action, 'company.created');
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).status, 'Pendiente');

    // A real FK violation proves that the invitation table is migrated, not merely db-pushed.
    await assert.rejects(prisma.ownerInvitation.create({ data: {
      companyId: company.id, userId: owner.id + 1_000_000, platformUserId: platformUser.id,
      tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000),
    } }), { code: 'P2003' });

    const before = await prisma.company.count();
    const duplicate = await request('/api/platform/companies', { ...payload, companyName: `Duplicate ${suffix}` }, auth);
    assert.equal(duplicate.status, 409);
    assert.equal(await prisma.company.count(), before);
    assert.equal(await prisma.platformAuditEvent.count({ where: { targetCompanyId: company.id } }), 1);

    const updated = await request(`/api/platform/companies/${company.id}`, {
      name: `Edited ${suffix}`, legalName: 'ECO CI', timezone: 'America/Argentina/Buenos_Aires',
    }, auth, 'PATCH');
    assert.equal(updated.status, 200);
    assert.equal((updated.body as { name: string }).name, `Edited ${suffix}`);
    assert.equal(await prisma.platformAuditEvent.count({ where: {
      targetCompanyId: company.id, platformUserId: platformUser.id, action: 'company.updated',
    } }), 1);

    // Same write order as PATCH: invalid audit FK must roll back the company update.
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: company.id }, data: { name: 'must roll back' } });
      await tx.platformAuditEvent.create({ data: {
        platformUserId: platformUser.id + 1_000_000, targetCompanyId: company.id, action: 'company.updated',
      } });
    }), { code: 'P2003' });
    assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).name, `Edited ${suffix}`);

    const pendingLogin = await request('/api/auth/login', { email, password });
    assert.equal(pendingLogin.status, 401);
    const redeem = () => request('/api/auth/activate-owner', { token: invitationToken, password });
    const attempts = await Promise.all([redeem(), redeem()]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 400]);
    assert.ok((await prisma.ownerInvitation.findUniqueOrThrow({ where: { userId: owner.id } })).consumedAt);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).status, 'Activo');
    assert.equal((await redeem()).status, 400);
    const ownerLogin = await request('/api/auth/login', { email, password });
    assert.equal(ownerLogin.status, 200);
    assert.equal((ownerLogin.body as { company: { id: number } }).company.id, company.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
