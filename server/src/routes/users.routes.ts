import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';

const router = Router();

router.use(requireAuth);

/** GET /api/users/roles — roles available for this company (user picker) */
router.get('/roles', requirePermission('usuarios.leer'), async (req, res) => {
  const roles = await prisma.role.findMany({
    where: tenantWhere(req),
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  res.json(roles);
});

/** GET /api/users — tenant-scoped users with roles and last access */
router.get('/', requirePermission('usuarios.leer'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: tenantWhere(req),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      createdAt: true,
      lastAccess: true,
      roles: { select: { role: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json(
    users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      status: u.status,
      createdAt: u.createdAt,
      lastAccess: u.lastAccess,
      roles: u.roles.map((ur) => ur.role.name),
    })),
  );
});

const createUserSchema = z.object({
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  roleId: z.number().int().positive(),
});

/** POST /api/users — creates a user inside the caller's company with a role */
router.post('/', requirePermission('usuarios.escribir'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const companyId = req.authUser!.companyId;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' });
    return;
  }

  const role = await prisma.role.findFirst({
    where: { id: data.roleId, companyId },
  });
  if (!role) {
    res.status(400).json({ error: 'Rol no válido' });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        companyId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        status: 'Activo',
        roles: { create: [{ roleId: role.id }] },
      },
      select: { id: true },
    });

    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Creación de Usuario',
        module: 'Configuración',
        entity: 'User',
        entityId: user.id,
        details: `Usuario ${data.firstName} ${data.lastName} (${data.email}) creado con rol ${role.name}`,
      },
      clientIp(req),
    );

    return user;
  });

  res.status(201).json({
    id: result.id,
    name: `${data.firstName} ${data.lastName}`,
    email: data.email,
    role: role.name,
  });
});

export default router;