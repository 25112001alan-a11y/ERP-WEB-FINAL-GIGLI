// Client selector helpers shared by the three screens that used to send a
// free-typed `clientName` (POS, manual order, sale invoice).

export interface ClientOption {
  id: number;
  name: string;
  province?: string | null;
  postalCode?: string | null;
  taxCondition?: string | null;
}

export interface ClientSelection {
  /** Present only when the typed name matches a client in the master. */
  clientId?: number;
  /** Always set: canonical master name on a match, the trimmed input otherwise. */
  clientName: string;
}

/**
 * Resolve what a document payload should send for the client field.
 *
 * A match sends `clientId` so the document links to the master entity. No
 * match keeps `clientName`, preserving the server's find-or-create-by-name
 * fallback (`documents.routes.ts`), so a name that is not in the master can
 * still be sold to.
 *
 * The comparison is trimmed and case-insensitive on purpose: MySQL's default
 * collation is case-insensitive, so the server would resolve the same query
 * to the same row.
 */
export function resolveClientSelection(query: string, clients: ClientOption[]): ClientSelection {
  const clientName = query.trim();
  if (!clientName) return { clientName: '' };
  const match = clients.find(
    (client) => client.name.trim().toLowerCase() === clientName.toLowerCase(),
  );
  return match ? { clientId: match.id, clientName: match.name } : { clientName };
}
