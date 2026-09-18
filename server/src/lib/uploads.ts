import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma.js';

/**
 * Attachment storage root.
 *
 * Defaults to a local `uploads/` directory for development. Production must
 * point UPLOADS_DIR at a persistent volume (Railway volume mounted in the
 * service) — the default container filesystem is ephemeral and would lose
 * every attachment on redeploy. A swap to S3/R2 keeps attachmentUrl opaque and
 * only changes where this directory is mounted.
 */
export const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads'),
);

fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * Deletes stored attachment files that no invoiceData row references.
 *
 * Runs at boot: an upload whose transaction failed (or whose document was
 * deleted) leaves an unreferenced file behind. The sweep is safe because
 * "referenced" means the exact basename exists in the attachmentUrl column;
 * concurrent uploads at boot are impossible (the server does not accept
 * requests until startup completes), so nothing freshly written can be
 * misclassified.
 */
export async function sweepOrphanAttachments(): Promise<void> {
  const files = await fs.promises.readdir(uploadsDir);
  if (files.length === 0) return;

  const referenced = await prisma.invoiceData.findMany({
    where: { attachmentUrl: { not: null } },
    select: { attachmentUrl: true },
  });
  const referencedNames = new Set(
    referenced
      .map((row) => row.attachmentUrl && path.basename(row.attachmentUrl))
      .filter((name): name is string => Boolean(name)),
  );

  let removed = 0;
  for (const name of files) {
    if (referencedNames.has(name)) continue;
    const fullPath = path.join(uploadsDir, name);
    try {
      await fs.promises.unlink(fullPath);
      removed += 1;
    } catch {
      // File disappeared or is locked; leave it for the next sweep.
    }
  }

  if (removed > 0) {
    console.log(`[uploads] sweep removed ${removed} orphan attachment(s)`);
  }
}