export function ownerTokenFromFragment(fragment: string): string | null {
  return /^#token=([a-fA-F0-9]{64})$/.exec(fragment)?.[1] ?? null;
}
