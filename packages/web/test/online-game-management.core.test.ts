/**
 * P96 web core — the export, the managed library, and library wakes.
 *
 * @see docs/spec/game-management/game-management.web.core.feature
 * @see docs/spec/game-management/SCENARIOS.md
 */

import { describe, expect, it } from 'vitest';
import {
  ALICE,
  INVITE_TOKEN,
  TWO_HUMAN_HEURISTIC,
  apiCalls,
  bearerOf,
  createInviteScript,
  makePagesHarness,
  parseJson,
} from './online-web.support';
import { showingWith } from './online-reliability.support';
import {
  DELETE_CONFIRM,
  DELETE_PATH,
  EXPORT_PATH,
  HIDE_PATH,
  counts,
  exportScript,
  finishedRows,
  libraryChanged,
  libraryScript,
  namedGameScript,
  okScript,
  pageScript,
} from './online-game-management.support';
import { GAME_ONE, GROUP_HASH } from './online-web.support';

const bodyOf = (raw: string | undefined): Record<string, unknown> =>
  (parseJson(raw) as Record<string, unknown> | undefined) ?? {};

describe('Download log uses the server export (D12)', () => {
  it("Download log in an online game saves the server's export", async () => {
    const raw = '{"format":"conquarrow-online-export","moves":[]}';
    const h = await showingWith(3, [exportScript(200, raw)]);

    const text = await h.adapter.exportGame();

    expect(text).toBe(raw);
    const calls = apiCalls(h, 'GET', EXPORT_PATH);
    expect(calls).toHaveLength(1);
    expect(calls[0] === undefined ? undefined : bearerOf(calls[0])).toBe(ALICE.bearer);
  });

  it('A failed export answers nothing', async () => {
    const h = await showingWith(3, [exportScript(500, '{"error":"x"}')]);

    expect(await h.adapter.exportGame()).toBeUndefined();
  });
});

describe('Names, delete and hide go through the server (D12)', () => {
  it('The invite name is sent on create', async () => {
    const h = makePagesHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [createInviteScript(INVITE_TOKEN)],
    });
    await h.adapter.boot();
    h.adapter.selectMode('online');
    h.adapter.setSeatPlan(TWO_HUMAN_HEURISTIC);

    h.adapter.setInviteName(' Friday  rematch');
    await h.adapter.createInvite();

    const posts = apiCalls(h, 'POST', '/invites');
    expect(bodyOf(posts[0]?.body)['name']).toBe('Friday rematch');
  });

  it('Delete sends the exact confirm, then refreshes the library', async () => {
    const h = makePagesHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [okScript(DELETE_PATH, { deleted: true })],
    });
    await h.adapter.boot();

    expect(await h.adapter.deleteGame(GROUP_HASH, GAME_ONE)).toBe(true);

    const deletes = apiCalls(h, 'POST', DELETE_PATH);
    expect(bodyOf(deletes[0]?.body)).toEqual({ confirm: DELETE_CONFIRM });
    const order = h.fetchLog.map((req) => `${req.method} ${req.url}`);
    const at = order.findIndex((line) => line.includes('/delete'));
    expect(order.slice(at + 1).some((line) => line.startsWith('GET') && line.includes('/my-games'))).toBe(true);
  });

  it('A library wake that deletes the game on screen clears it', async () => {
    const h = await showingWith(3, []);

    await h.adapter.receiveLibraryChanged(libraryChanged('deleted'));

    expect(h.adapter.board()).toBeUndefined();
    expect(h.location.hash).toBe('');
    expect(h.adapter.gameDeleted()).toBe(true);
  });

  it('A rename wake reads the library and the game on screen again', async () => {
    const h = await showingWith(3, [namedGameScript(3, 'New')]);

    await h.adapter.receiveLibraryChanged(libraryChanged('renamed'));

    expect(apiCalls(h, 'GET', `/games/${GROUP_HASH}/${GAME_ONE}`)).toHaveLength(2);
    expect(apiCalls(h, 'GET', '/my-games').length).toBeGreaterThan(0);
    expect(h.adapter.board()?.name).toBe('New');
  });

  it('Show more pages a section', async () => {
    const h = makePagesHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [
        libraryScript(finishedRows(0, 10), counts({ finished: 12 })),
        pageScript('finished', 10, 12, finishedRows(10, 12)),
      ],
    });
    await h.adapter.boot();
    await h.adapter.refreshLibrary();

    await h.adapter.loadMoreGames('finished');

    const pages = apiCalls(h, 'GET', '/my-games');
    const url = new URL(pages[pages.length - 1]?.url ?? 'http://x/');
    expect(url.searchParams.get('section')).toBe('finished');
    expect(url.searchParams.get('offset')).toBe('10');
    expect(h.adapter.myGames()?.games.map((row) => row.gameNumber)).toEqual(
      finishedRows(0, 12).map((row) => row.gameNumber),
    );
    expect(h.adapter.myGames()?.counts.finished).toBe(12);
  });

  it('Hide and unhide refresh the library', async () => {
    const h = makePagesHarness({
      sessionToken: ALICE.bearer,
      fetchScript: [okScript(HIDE_PATH, { hidden: true })],
    });
    await h.adapter.boot();

    expect(await h.adapter.hideGame(GROUP_HASH, GAME_ONE, true)).toBe(true);

    expect(bodyOf(apiCalls(h, 'POST', HIDE_PATH)[0]?.body)).toEqual({ hidden: true });
    expect(apiCalls(h, 'GET', '/my-games').length).toBeGreaterThan(0);
  });
});
