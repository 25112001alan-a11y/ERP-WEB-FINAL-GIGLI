import { describe, expect, it } from 'vitest';
import { resolveClientSelection } from './clientSelection';

const clients = [
  { id: 7, name: 'Acme SRL' },
  { id: 9, name: 'Ana Gómez' },
  { id: 13, name: 'Ana Gómez' },
  { id: 21, name: 'Distribuidora Sur' },
];

describe('resolveClientSelection', () => {
  it('sends no client id for a blank query', () => {
    expect(resolveClientSelection('   ', clients)).toEqual({ clientName: '' });
  });

  it('sends the client id when the name matches the master', () => {
    expect(resolveClientSelection('Acme SRL', clients)).toEqual({
      clientId: 7,
      clientName: 'Acme SRL',
    });
  });

  it('matches ignoring case and surrounding whitespace', () => {
    expect(resolveClientSelection('  acme srl ', clients)).toEqual({
      clientId: 7,
      clientName: 'Acme SRL',
    });
  });

  it('keeps the free-typed name when no client matches', () => {
    expect(resolveClientSelection('Cliente nuevo', clients)).toEqual({
      clientName: 'Cliente nuevo',
    });
  });

  it('resolves homonyms to the first row, mirroring the server findFirst', () => {
    expect(resolveClientSelection('Ana Gómez', clients)).toEqual({
      clientId: 9,
      clientName: 'Ana Gómez',
    });
  });
});
