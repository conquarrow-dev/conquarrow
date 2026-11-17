/**
 * P96 web mutation pins — edges Stryker found unobserved in the P96 web suite:
 * failed management calls, the hidden list, rename, paging guards and the
 * parsers' drop-don't-fail rules.
 *
 * @see docs/spec/game-management/game-management.md
 */

import { describe, expect, it } from 'vitest';
import type { MyGamesBody } from '@conquarrow/contracts';
import {
  parseBoard,
  parseGoneReason,
  parseLibraryChanged,
  parseLibraryPage,
  parseMyGames,
} from '../src/online-parse';
import { librarySections } from '../src/online-shell-ui';
import {
  ALICE,
  GAME_ONE,
  GROUP_HASH,
  OTHER_GROUP_HASH,
  apiCalls,
  boardAt,
  makePagesHarness,
  parseJson,
  type ScriptedFetch,
} from './online-web.support';
import { showingWith } from './online-reliability.support';
import {
  DELETE_PATH,
  EXPORT_PATH,
  HIDE_PATH,
  NAME_PATH,
  counts,
  exportScript,
  libraryChanged,
  libraryRow,
  libraryScript,
  namedGameScript,
  okScript,
  pageScript,
} from './online-game-management.support';

const GAME_TWO = '000002';

const failScript = (path: string, status: number): ScriptedFetch => ({ method: 'POST', path, status, body: {} });
const dropScript = (path: string): ScriptedFetch => ({ method: 'POST', path, status: 0, reject: new Error('drop') });

const booted = async (fetchScript: readonly ScriptedFetch[]): Promise<ReturnType<typeof makePagesHarness>> => {
  const h = makePagesHarness({ sessionToken: ALICE.bearer, fetchScript });
  await h.adapter.boot();
  return h;
};

const myGamesReads = (h: ReturnType<typeof makePagesHarness>): number => apiCalls(h, 'GET', '/my-games').length;

const hiddenRow = (gameNumber: string, groupHash: string = GROUP_HASH) =>
  libraryRow({ gameNumber, groupHash, hidden: true });

const bodyOf = (raw: string | undefined): unknown => parseJson(raw ?? '');

describe('Download log edges (D12)', () => {
  it('Nothing on screen asks for no export', async () => {
    const h = await booted([]);
    expect(await h.adapter.exportGame()).toBeUndefined();
    expect(apiCalls(h, 'GET', EXPORT_PATH)).toHaveLength(0);
  });

  it('A 401 or a dropped request answers nothing', async () => {
    const h401 = await showingWith(3, [exportScript(401, '{}')]);
    expect(await h401.adapter.exportGame()).toBeUndefined();
    const dropped = await showingWith(3, [{ method: 'GET', path: EXPORT_PATH, status: 0, reject: new Error('x') }]);
    expect(await dropped.adapter.exportGame()).toBeUndefined();
  });
});

describe('A failed management call changes nothing (D5, D6, D9)', () => {
  it.each([
    ['refused', failScript(DELETE_PATH, 409)],
    ['unauthorized', failScript(DELETE_PATH, 401)],
    ['dropped', dropScript(DELETE_PATH)],
  ])('Delete %s answers false without a refresh', async (_label, script) => {
    const h = await showingWith(3, [script]);
    const before = myGamesReads(h);

    expect(await h.adapter.deleteGame(GROUP_HASH, GAME_ONE)).toBe(false);

    expect(myGamesReads(h)).toBe(before);
    expect(h.adapter.board()).toBeDefined();
    expect(h.adapter.gameDeleted()).toBe(false);
  });

  it('Hide refused answers false without a refresh', async () => {
    const h = await booted([failScript(HIDE_PATH, 409)]);
    const before = myGamesReads(h);
    expect(await h.adapter.hideGame(GROUP_HASH, GAME_ONE, true)).toBe(false);
    expect(myGamesReads(h)).toBe(before);
  });

  it('Rename refused answers false without a refresh', async () => {
    const h = await booted([failScript(NAME_PATH, 422)]);
    const before = myGamesReads(h);
    expect(await h.adapter.renameGame(GROUP_HASH, GAME_ONE, 'Ok')).toBe(false);
    expect(myGamesReads(h)).toBe(before);
  });
});

describe('Delete of a game elsewhere (D5)', () => {
  it('Deleting another game keeps the one on screen and drops only its hidden row', async () => {
    const h = await showingWith(3, [
      libraryScript([], counts({ hidden: 3 })),
      pageScript('hidden', 0, 3, [hiddenRow(GAME_TWO), hiddenRow(GAME_ONE), hiddenRow(GAME_TWO, OTHER_GROUP_HASH)]),
      okScript(`/games/${GROUP_HASH}/${GAME_TWO}/delete`, { deleted: true }),
    ]);
    await h.adapter.refreshLibrary();
    await h.adapter.loadMoreGames('hidden');

    expect(await h.adapter.deleteGame(GROUP_HASH, GAME_TWO)).toBe(true);

    expect(h.adapter.board()).toBeDefined();
    expect(h.adapter.gameDeleted()).toBe(false);
    expect(h.adapter.hiddenGames().map((row) => `${row.groupHash}/${row.gameNumber}`)).toEqual([
      `${GROUP_HASH}/${GAME_ONE}`,
      `${OTHER_GROUP_HASH}/${GAME_TWO}`,
    ]);
  });

  it('A deleted wake for another game keeps the one on screen and drops its hidden row', async () => {
    const h = await showingWith(3, [
      libraryScript([], counts({ hidden: 2 })),
      pageScript('hidden', 0, 2, [hiddenRow(GAME_ONE, OTHER_GROUP_HASH), hiddenRow(GAME_TWO, OTHER_GROUP_HASH)]),
    ]);
    await h.adapter.refreshLibrary();
    await h.adapter.loadMoreGames('hidden');

    await h.adapter.receiveLibraryChanged({ ...libraryChanged('deleted'), groupHash: OTHER_GROUP_HASH });

    expect(h.adapter.board()).toBeDefined();
    expect(h.adapter.gameDeleted()).toBe(false);
    expect(h.adapter.hiddenGames().map((row) => row.gameNumber)).toEqual([GAME_TWO]);
  });

  it('A renamed wake for another game does not read the game on screen again', async () => {
    const h = await showingWith(3, []);
    const before = apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`).length;

    await h.adapter.receiveLibraryChanged({ ...libraryChanged('renamed'), gameNumber: GAME_TWO });

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(before);
  });
});

describe('Hide keeps the Hidden list in step (D9)', () => {
  const hiddenPageReads = (h: ReturnType<typeof makePagesHarness>): number =>
    apiCalls(h, 'GET', '/my-games').filter((req) => req.url.includes('section=hidden')).length;

  it('Hiding reloads the Hidden list when there is one', async () => {
    const h = await booted([
      okScript(HIDE_PATH, { hidden: true }),
      libraryScript([], counts({ hidden: 1 })),
      pageScript('hidden', 0, 1, [hiddenRow(GAME_ONE)]),
    ]);

    await h.adapter.hideGame(GROUP_HASH, GAME_ONE, true);

    expect(hiddenPageReads(h)).toBe(1);
    expect(h.adapter.hiddenGames().map((row) => row.gameNumber)).toEqual([GAME_ONE]);
  });

  it('Hiding with nothing hidden left reads no Hidden page', async () => {
    const h = await booted([okScript(HIDE_PATH, { hidden: true }), libraryScript([], counts({ hidden: 0 }))]);
    await h.adapter.hideGame(GROUP_HASH, GAME_ONE, true);
    expect(hiddenPageReads(h)).toBe(0);
  });

  it('Unhiding with no Hidden list open reads no Hidden page', async () => {
    const h = await booted([okScript(HIDE_PATH, { hidden: false }), libraryScript([], counts({ hidden: 4 }))]);
    await h.adapter.hideGame(GROUP_HASH, GAME_ONE, false);
    expect(hiddenPageReads(h)).toBe(0);
  });

  it('Unhiding with the Hidden list open reloads it from the start', async () => {
    const h = await booted([
      libraryScript([], counts({ hidden: 2 })),
      pageScript('hidden', 0, 2, [hiddenRow(GAME_ONE), hiddenRow(GAME_TWO)]),
      okScript(HIDE_PATH, { hidden: false }),
      libraryScript([], counts({ hidden: 1 })),
      pageScript('hidden', 0, 1, [hiddenRow(GAME_TWO)]),
    ]);
    await h.adapter.refreshLibrary();
    await h.adapter.loadMoreGames('hidden');

    await h.adapter.hideGame(GROUP_HASH, GAME_ONE, false);

    const pages = apiCalls(h, 'GET', '/my-games').filter((req) => req.url.includes('section=hidden'));
    expect(pages.map((req) => new URL(req.url, 'http://x').searchParams.get('offset'))).toEqual(['0', '0']);
    expect(h.adapter.hiddenGames().map((row) => row.gameNumber)).toEqual([GAME_TWO]);
    expect(h.adapter.myGames()?.counts.hidden).toBe(1);
  });
});

describe('Rename (D6)', () => {
  it('An invalid name is not sent', async () => {
    const h = await booted([]);
    expect(await h.adapter.renameGame(GROUP_HASH, GAME_ONE, '<b>')).toBe(false);
    expect(apiCalls(h, 'POST', NAME_PATH)).toHaveLength(0);
  });

  it('The name is sent normalized; an empty one clears it', async () => {
    const h = await booted([okScript(NAME_PATH, { name: 'A b' }), okScript(NAME_PATH, {})]);

    expect(await h.adapter.renameGame(GROUP_HASH, GAME_ONE, '  A   b ')).toBe(true);
    expect(await h.adapter.renameGame(GROUP_HASH, GAME_ONE, '   ')).toBe(true);

    expect(apiCalls(h, 'POST', NAME_PATH).map((req) => bodyOf(req.body))).toEqual([{ name: 'A b' }, { name: '' }]);
  });

  it('Renaming the game on screen reads it again; another game does not', async () => {
    const h = await showingWith(3, [
      okScript(NAME_PATH, {}),
      namedGameScript(3, 'New'),
      okScript(`/games/${GROUP_HASH}/${GAME_TWO}/name`, {}),
    ]);
    const reads = (): number => apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`).length;
    const before = reads();

    await h.adapter.renameGame(GROUP_HASH, GAME_ONE, 'New');
    expect(reads()).toBe(before + 1);
    expect(h.adapter.board()?.name).toBe('New');

    await h.adapter.renameGame(GROUP_HASH, GAME_TWO, 'Other');
    expect(reads()).toBe(before + 1);
  });
});

const REFUSED_PAGE: ScriptedFetch = { method: 'GET', path: '/my-games', status: 500, body: {} };
const UNREADABLE_PAGE: ScriptedFetch = { method: 'GET', path: '/my-games', status: 200, body: { section: 'finished' } };

describe('Show more guards (D8)', () => {
  it('The offset counts only the rows of that section', async () => {
    const h = await booted([
      libraryScript(
        [libraryRow({ gameNumber: '000007', status: 'waiting', section: 'waiting' }), libraryRow({ gameNumber: GAME_ONE })],
        counts({ waiting: 1, finished: 3 }),
      ),
    ]);
    await h.adapter.refreshLibrary();

    await h.adapter.loadMoreGames('finished');

    const last = apiCalls(h, 'GET', '/my-games').at(-1);
    expect(new URL(last?.url ?? '', 'http://x').searchParams.get('offset')).toBe('1');
  });

  it.each([
    ['a refused page', REFUSED_PAGE],
    ['a page of another section', pageScript('waiting', 1, 9, [libraryRow({ gameNumber: '000009' })])],
    ['an unreadable page', UNREADABLE_PAGE],
  ])('%s is ignored', async (_label, script) => {
    const h = await booted([libraryScript([libraryRow({ gameNumber: GAME_ONE })], counts({ finished: 3 })), script]);
    await h.adapter.refreshLibrary();

    await h.adapter.loadMoreGames('finished');

    expect(h.adapter.myGames()?.games.map((row) => row.gameNumber)).toEqual([GAME_ONE]);
    expect(h.adapter.myGames()?.counts.finished).toBe(3);
  });

  it('A row already held is not added twice', async () => {
    const h = await booted([
      libraryScript([libraryRow({ gameNumber: GAME_ONE })], counts({ finished: 2 })),
      pageScript('finished', 1, 2, [libraryRow({ gameNumber: GAME_ONE }), libraryRow({ gameNumber: GAME_TWO })]),
    ]);
    await h.adapter.refreshLibrary();

    await h.adapter.loadMoreGames('finished');

    expect(h.adapter.myGames()?.games.map((row) => row.gameNumber)).toEqual([GAME_ONE, GAME_TWO]);
  });

  it('A Hidden page appends new rows and takes its total', async () => {
    const h = await booted([
      libraryScript([], counts({ hidden: 2 })),
      pageScript('hidden', 0, 5, [hiddenRow(GAME_ONE)]),
      pageScript('hidden', 1, 5, [hiddenRow(GAME_ONE), hiddenRow(GAME_TWO)]),
    ]);
    await h.adapter.refreshLibrary();

    await h.adapter.loadMoreGames('hidden');
    await h.adapter.loadMoreGames('hidden');

    expect(h.adapter.hiddenGames().map((row) => row.gameNumber)).toEqual([GAME_ONE, GAME_TWO]);
    expect(h.adapter.myGames()?.counts.hidden).toBe(5);
  });

  it('Signed out, Show more asks for nothing', async () => {
    const h = makePagesHarness({});
    await h.adapter.boot();
    await h.adapter.loadMoreGames('finished');
    expect(apiCalls(h, 'GET', '/my-games')).toHaveLength(0);
  });
});

describe('Sections leave hidden rows out (D11)', () => {
  it('A hidden row in the games list is in no section', () => {
    const library: MyGamesBody = {
      lobbies: [],
      games: [libraryRow({ gameNumber: GAME_ONE, hidden: true }), libraryRow({ gameNumber: GAME_TWO })],
      counts: counts({ finished: 1 }),
    };
    expect(librarySections(library, []).map((s) => s.rows.map((row) => row.gameNumber))).toEqual([[], [], [GAME_TWO]]);
  });
});

describe('The parsers drop what they cannot read (D4, D6, D8)', () => {
  const row = (extra: Record<string, unknown>) => ({ ...libraryRow({ gameNumber: GAME_ONE }), ...extra });
  const parsedRow = (extra: Record<string, unknown>) =>
    parseMyGames({ lobbies: [], games: [row(extra)] })?.games[0];

  it('A board keeps a name and a boolean owner only', () => {
    expect(parseBoard({ ...boardAt(1), name: 'N', owner: false })).toMatchObject({ name: 'N', owner: false });
    const odd = parseBoard({ ...boardAt(1), name: '', owner: 'yes' });
    expect(odd).not.toHaveProperty('name');
    expect(odd).not.toHaveProperty('owner');
  });

  it('A row without a section takes it from its status', () => {
    const { section: _drop, ...bare } = row({});
    const of = (status: string) => parseMyGames({ lobbies: [], games: [{ ...bare, status }] })?.games[0]?.section;
    expect([of('won'), of('lost'), of('waiting'), of('your-turn')]).toEqual(['finished', 'finished', 'waiting', 'your-turn']);
    expect(parsedRow({ section: 'hidden', status: 'waiting' })?.section).toBe('waiting');
  });

  it('owner and hidden are true only when exactly true', () => {
    expect(parsedRow({ owner: 'true', hidden: 1 })).toMatchObject({ owner: false, hidden: false });
    expect(parsedRow({ owner: true, hidden: true })).toMatchObject({ owner: true, hidden: true });
  });

  it('Malformed optional fields are dropped', () => {
    for (const extra of [
      { turns: -1 },
      { turns: 1.5 },
      { activeSeat: 2 },
      { activeSeat: -1 },
      { activeSeat: 0.5 },
      { winner: { seat: 2, label: 'x' } },
      { winner: { seat: 0, label: 3 } },
      { name: '' },
      { lastActivityAt: '' },
    ]) {
      const parsed = parsedRow(extra);
      expect(parsed).toBeDefined();
      for (const key of Object.keys(extra)) expect(parsed).not.toHaveProperty(key);
    }
    expect(parsedRow({ turns: 0, activeSeat: 1, winner: { seat: 1, label: 'AI' }, lastActivityAt: 't' })).toMatchObject({
      turns: 0,
      activeSeat: 1,
      winner: { seat: 1, label: 'AI' },
      lastActivityAt: 't',
    });
  });

  it('Counts fall back per list to counting rows', () => {
    const parsed = parseMyGames({
      lobbies: [],
      games: [row({}), row({ gameNumber: GAME_TWO, hidden: true }), row({ gameNumber: '000003', section: 'waiting', status: 'waiting' })],
      counts: { finished: 7, waiting: -1 },
    });
    expect(parsed?.counts).toEqual({ 'your-turn': 0, waiting: 1, finished: 7, hidden: 1 });
  });

  it('A page needs a known section, counts and readable rows', () => {
    const good = { section: 'hidden', offset: 0, limit: 10, total: 1, games: [row({})] };
    expect(parseLibraryPage(good)?.section).toBe('hidden');
    for (const bad of [
      undefined,
      { ...good, section: 'nope' },
      { ...good, offset: -1 },
      { ...good, limit: 'x' },
      { ...good, total: 1.5 },
      { ...good, games: {} },
      { ...good, games: [{}] },
    ]) {
      expect(parseLibraryPage(bad)).toBeUndefined();
    }
  });

  it('A libraryChanged needs both ids and a known change', () => {
    const good = libraryChanged('renamed');
    expect(parseLibraryChanged(JSON.stringify(good))).toEqual(good);
    expect(parseLibraryChanged(JSON.stringify(libraryChanged('deleted')))?.change).toBe('deleted');
    for (const bad of [
      { ...good, type: 'stateChanged' },
      { ...good, groupHash: '' },
      { ...good, gameNumber: 1 },
      { ...good, change: 'hidden' },
    ]) {
      expect(parseLibraryChanged(JSON.stringify(bad))).toBeUndefined();
    }
  });

  it('A 410 reason of deleted is read', () => {
    expect(parseGoneReason({ reason: 'deleted' })).toBe('deleted');
    expect(parseGoneReason({ reason: 'gone' })).toBeUndefined();
  });
});
