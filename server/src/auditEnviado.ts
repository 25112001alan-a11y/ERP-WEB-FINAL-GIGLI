// Auditoría read-only de PEDIDO históricos marcados «Enviado» (F1.2).
// NO escribe nada: consulta, clasifica con lib/estadoEnviado.ts e imprime el reporte.
// Exit code: 0 si todo «Enviado» es consistente con sus remitos; 1 si hay
// inconsistencias (corto / sin despacho / sin trazabilidad).
//
// Uso: npm run audit:enviado
import 'dotenv/config';
import { prisma } from './lib/prisma.js';
import { veredictoEnviado, type Veredicto } from './lib/estadoEnviado.js';

const CLASE_LABEL: Record<Veredicto['clase'], string> = {
  consistente: 'Consistente',
  corto: 'Corto (faltan entregas por línea)',
  sin_despacho: 'Sin despacho registrado',
  sin_trazabilidad: 'Sin trazabilidad por línea (pre-migración)',
};

async function main() {
  const pedidos = await prisma.document.findMany({
    where: { type: 'PEDIDO', status: 'Enviado' },
    select: {
      id: true,
      number: true,
      date: true,
      clientName: true,
      company: { select: { id: true, name: true } },
      items: { select: { id: true, quantity: true, sku: true, description: true } },
      childDocuments: {
        select: {
          id: true,
          type: true,
          number: true,
          items: { select: { sourceDocumentItemId: true, quantity: true } },
        },
      },
    },
    orderBy: [{ companyId: 'asc' }, { number: 'asc' }],
  });

  const porCompania = new Map<string, number[]>();
  const inconsistentes: { pedido: (typeof pedidos)[number]; veredicto: Veredicto }[] = [];

  for (const pedido of pedidos) {
    const remitos = pedido.childDocuments
      .filter((c) => c.type === 'REMITO')
      .map((r) => ({ items: r.items.map((i) => ({ sourceDocumentItemId: i.sourceDocumentItemId, cantidad: Number(i.quantity) })) }));
    const veredicto = veredictoEnviado({
      pedido: { id: pedido.id, rubros: pedido.items.map((i) => ({ id: i.id, cantidad: Number(i.quantity) })) },
      remitos,
    });
    const key = pedido.company.name;
    const bucket = porCompania.get(key) ?? [];
    if (veredicto.clase !== 'consistente') {
      bucket.push(pedido.id);
      inconsistentes.push({ pedido, veredicto });
    }
    porCompania.set(key, bucket);
  }

  console.log(`PEDIDO «Enviado»: ${pedidos.length} · inconsistentes: ${inconsistentes.length}`);
  for (const [compania, ids] of porCompania) {
    console.log(`- ${compania}: ${ids.length} inconsistentes ${ids.length ? `(${ids.join(', ')})` : ''}`);
  }

  for (const { pedido, veredicto } of inconsistentes) {
    const fecha = pedido.date.toISOString().slice(0, 10);
    console.log(`\nPEDIDO #${pedido.number} (id ${pedido.id}) · ${pedido.company.name} · ${fecha} · cliente ${pedido.clientName ?? '-'}`);
    console.log(`  Veredicto: ${CLASE_LABEL[veredicto.clase]}`);
    if (veredicto.clase === 'corto') {
      for (const rubro of veredicto.rubros) {
        const item = pedido.items.find((i) => i.id === rubro.id);
        console.log(`  - ${item?.sku ?? item?.description ?? `línea ${rubro.id}`}: pedido ${rubro.pedido} · entregado ${rubro.entregado}`);
      }
    }
    for (const remito of pedido.childDocuments.filter((c) => c.type === 'REMITO')) {
      console.log(`    remito: #${remito.number} (id ${remito.id})`);
    }
  }

  await prisma.$disconnect();
  if (inconsistentes.length > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[audit:enviado] falló la consulta:', err);
  await prisma.$disconnect();
  process.exit(2);
});