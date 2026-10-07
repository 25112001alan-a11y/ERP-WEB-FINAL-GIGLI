import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, requireAssignedBranch, documentBranchWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/** GET /api/finance — cash-flow movements derived from document payments */
router.get('/', requirePermission('finanzas.leer'), requireAssignedBranch, async (req, res) => {
  const companyId = req.authUser!.companyId;

  const payments = await prisma.payment.findMany({
    where: { companyId, document: { is: documentBranchWhere(req) } },
    include: {
      document: {
        include: {
          client: { select: { name: true } },
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
    take: 200,
  });

  const txs = payments.map((p) => {
    const doc = p.document;
    // Ingreso: VENTA siempre; FACTURA solo cuando es de cliente (clientId).
    // La FACTURA a proveedor es egreso, igual que la COMPRA.
    const income = doc.type === 'VENTA' || (doc.type === 'FACTURA' && doc.clientId != null);
    const partyName = doc.client?.name ?? doc.supplier?.name ?? '';
    const amount = Number(p.amount);
    return {
      id: `PAY-${String(p.id).padStart(5, '0')}`,
      date: p.date,
      concept: `${doc.type} ${doc.series}-${String(doc.number).padStart(4, '0')}${partyName ? ` — ${partyName}` : ''}`,
      method: p.method,
      amount: income ? amount : -amount,
      type: income ? 'Ingreso' : 'Egreso',
      status: p.status === 'Pagado' ? 'Completado' : p.status,
    };
  });

  res.json(txs);
});

export default router;
