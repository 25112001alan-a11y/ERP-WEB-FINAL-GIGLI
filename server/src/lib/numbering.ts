import type { DocumentType, Prisma } from '@prisma/client';

/**
 * Reserves the next fiscal number for (companyId, type, series).
 *
 * MUST be called inside the same interactive transaction that creates the
 * document. The counter row is created lazily and then read with
 * SELECT ... FOR UPDATE, so concurrent issuances serialize on that row and can
 * never take the same number (the unique constraint on Document stays as a
 * last-resort backstop, not as the normal path).
 *
 * Returns the number to assign; the stored counter is advanced to the following
 * value atomically.
 */
export async function reserveNextNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
  type: DocumentType,
  series: string,
): Promise<number> {
  // Create the row when missing, starting above whatever numbers already exist
  // for that (companyId, type, series): the counter is introduced into databases
  // that already have documents, so starting at 1 would collide with them.
  // ON DUPLICATE KEY UPDATE is a no-op that still takes the row lock under
  // InnoDB, so the following SELECT is serialized.
  await tx.$executeRaw`
    INSERT INTO comprobantes_contadores (companyId, type, series, nextNumber)
    SELECT ${companyId}, ${type}, ${series}, COALESCE(MAX(number), 0) + 1
    FROM comprobantes
    WHERE companyId = ${companyId} AND type = ${type} AND series = ${series}
    ON DUPLICATE KEY UPDATE nextNumber = nextNumber
  `;

  const rows = await tx.$queryRaw<{ nextNumber: number }[]>`
    SELECT nextNumber FROM comprobantes_contadores
    WHERE companyId = ${companyId} AND type = ${type} AND series = ${series}
    FOR UPDATE
  `;
  const current = rows[0]?.nextNumber ?? 1;

  await tx.$executeRaw`
    UPDATE comprobantes_contadores
    SET nextNumber = nextNumber + 1
    WHERE companyId = ${companyId} AND type = ${type} AND series = ${series}
  `;

  return current;
}
