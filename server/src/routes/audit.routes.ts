import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/** GET /api/audit-logs — tenant-scoped audit trail with actor names */
router.get('/', requirePermission('auditoria.leer'), async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: tenantWhere(req),
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json(
    logs.map((l) => ({
      id: l.id,
      timestamp: l.createdAt,
      user: `${l.user.firstName} ${l.user.lastName}`,
      userEmail: l.user.email,
      action: l.action,
      module: l.module,
      entity: l.entity,
      entityId: l.entityId,
      details: l.details,
      ip: l.ip,
    })),
  );
});

export default router;