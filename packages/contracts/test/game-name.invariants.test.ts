/**
 * EARS invariant 8 for game names (P96 D6), plus the delete confirm (D5).
 *
 * @see docs/spec/game-management/game-management.md
 */

import { describe, expect, it } from 'vitest';
import { DELETE_GAME_CONFIRM, GAME_NAME_MAX, gameTitle, normalizeGameName } from '../src/index';

describe('normalizeGameName (D6)', () => {
  it.each([
    [undefined],
    [null],
    [''],
    ['   '],
    ['\t\n '],
  ])('%j is no name', (value) => {
    expect(normalizeGameName(value)).toEqual({ ok: true, name: undefined });
  });

  it.each([
    ['Friday rematch', 'Friday rematch'],
    ['  Friday   rematch ', 'Friday rematch'],
    ['P95\t6-seat\nplaytest', 'P95 6-seat playtest'],
    ['Gilad & Dev: round #2 (final)!', 'Gilad & Dev: round #2 (final)!'],
    ['שלום עולם', 'שלום עולם'],
    ['Café', 'Café'],
    ['Cafe\u0301', 'Café'],
    ['a/b@c+d_e.f,g;h?i\'j"k', 'a/b@c+d_e.f,g;h?i\'j"k'],
  ])('%j is %j', (value, name) => {
    expect(normalizeGameName(value)).toEqual({ ok: true, name });
  });

  it('accepts exactly GAME_NAME_MAX code points', () => {
    expect(GAME_NAME_MAX).toBe(48);
    expect(normalizeGameName('x'.repeat(48))).toEqual({ ok: true, name: 'x'.repeat(48) });
    expect(normalizeGameName('ש'.repeat(48))).toEqual({ ok: true, name: 'ש'.repeat(48) });
    expect(normalizeGameName('x'.repeat(49))).toEqual({ ok: false });
  });

  it('counts the length after collapsing white space', () => {
    expect(normalizeGameName(`  ${'x'.repeat(24)}      ${'y'.repeat(23)}  `)).toEqual({
      ok: true,
      name: `${'x'.repeat(24)} ${'y'.repeat(23)}`,
    });
  });

  it.each([[42], [true], [{}], [['a']], ['<script>'], ['a\u0000b'], ['emoji 🎉'], ['tab\u200Bzero'], ['back\\slash']])(
    '%j is invalid',
    (value) => {
      expect(normalizeGameName(value)).toEqual({ ok: false });
    },
  );

  it('is idempotent on every name it accepts', () => {
    for (const raw of ['  a   b ', 'Cafe\u0301', 'שלום  עולם', 'x'.repeat(48)]) {
      const once = normalizeGameName(raw);
      if (!once.ok || once.name === undefined) throw new Error('setup: expected a name');
      expect(normalizeGameName(once.name)).toEqual(once);
    }
  });
});

describe('gameTitle (D6)', () => {
  it('is the name, else Game and the number', () => {
    expect(gameTitle('Friday', '000003')).toBe('Friday');
    expect(gameTitle(undefined, '000003')).toBe('Game 000003');
  });
});

describe('DELETE_GAME_CONFIRM (D5)', () => {
  it('is the exact phrase', () => {
    expect(DELETE_GAME_CONFIRM).toBe('Yes, permanently delete this game');
  });
});
