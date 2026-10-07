import { describe, expect, it } from 'vitest';
import { ownerTokenFromFragment } from './ownerActivation';

describe('owner activation fragment', () => {
  it('accepts only one complete 64-digit hexadecimal token', () => {
    const token = 'aB'.repeat(32);
    expect(ownerTokenFromFragment(`#token=${token}`)).toBe(token);
    for (const fragment of ['', '#token=short', `#token=${token}&other=1`, `#token=${'z'.repeat(64)}`, `?token=${token}`]) {
      expect(ownerTokenFromFragment(fragment)).toBeNull();
    }
  });
});
