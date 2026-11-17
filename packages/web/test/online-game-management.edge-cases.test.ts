/**
 * P96 web edge cases — odd answers, the host's socket, and the lobby's helpers.
 *
 * @see docs/spec/game-management/game-management.web.edge-cases.feature
 */

import { describe, expect, it } from 'vitest';
import type { MyGamesBody } from '@conquarrow/contracts';
import {
  exportFileName,
  librarySections,
  libraryRowTitle,
  libraryTurnLine,
  libraryWinnerLine,
} from '../src/online-shell-ui';
import {
  ALICE,
  GAME_ONE,
  GROUP_HASH,
  TWO_HUMAN_HEURISTIC,
  gameHash,
  makePagesHarness,
} from './online-web.support';
import { makeHostHarness } from './online-shell.support';
import { snapshotScript } from './online-move-log-replay.support';
import { counts, libraryChanged, libraryRow } from './online-game-management.support';

describe('Edges of the web library and export', () => {
  it('A 404 for the game on screen marks it deleted', async () => {
    const h = makePagesHarness({
      sessionToken: ALICE.bearer,
      hash: gameHash(GROUP_HASH, GAME_ONE),
      fetchScript: [{ method: 'GET', path: `/games/${GROUP_HASH}/${GAME_ONE}`, status: 404, body: {} }],
    });

    await h.adapter.boot();

    expect(h.adapter.board()).toBeUndefined();
    expect(h.adapter.gameDeleted()).toBe(true);
  });

  it('The host forwards a libraryChanged message and drops a malformed one', async () => {
    const h = makeHostHarness({
      sessionToken: ALICE.bearer,
      hash: gameHash(GROUP_HASH, GAME_ONE),
      fetchScript: [snapshotScript(2)],
    });
    await h.host.boot();
    const { change: _drop, ...noChange } = libraryChanged('deleted');

    await h.host.handleSocketMessage(JSON.stringify(noChange));
    expect(h.host.adapter().gameDeleted()).toBe(false);
    expect(h.host.board()?.version).toBe(2);

    await h.host.handleSocketMessage(JSON.stringify(libraryChanged('deleted')));
    expect(h.host.adapter().gameDeleted()).toBe(true);
    expect(h.host.board()).toBeUndefined();
  });

  it('An invalid invite name blocks create', async () => {
    const h = makePagesHarness({ sessionToken: ALICE.bearer });
    await h.adapter.boot();
    h.adapter.selectMode('online');
    h.adapter.setSeatPlan(TWO_HUMAN_HEURISTIC);
    expect(h.adapter.createOffered()).toBe(true);

    h.adapter.setInviteName('x'.repeat(49));

    expect(h.adapter.inviteNameValid()).toBe(false);
    expect(h.adapter.createOffered()).toBe(false);
  });

  it('Rows are grouped into sections with Finished and Hidden collapsed', () => {
    const library: MyGamesBody = {
      lobbies: [],
      games: [
        libraryRow({ gameNumber: '000001', status: 'your-turn', section: 'your-turn' }),
        libraryRow({ gameNumber: '000002', status: 'waiting', section: 'waiting' }),
        libraryRow({ gameNumber: '000003' }),
      ],
      counts: counts({ 'your-turn': 1, waiting: 1, finished: 4, hidden: 2 }),
    };
    const hidden = [libraryRow({ gameNumber: '000009', hidden: true })];

    const sections = librarySections(library, hidden);

    expect(sections.map((s) => [s.list, s.title, s.count, s.collapsedByDefault, s.more])).toEqual([
      ['your-turn', 'Your turn', 1, false, false],
      ['waiting', 'Waiting', 1, false, false],
      ['finished', 'Finished', 4, true, true],
      ['hidden', 'Hidden', 2, true, true],
    ]);
    expect(sections[3]?.rows.map((row) => row.gameNumber)).toEqual(['000009']);
    expect(
      librarySections({ ...library, counts: counts({ 'your-turn': 1, waiting: 1, finished: 1 }) }, []).map(
        (s) => s.list,
      ),
    ).toEqual(['your-turn', 'waiting', 'finished']);
  });

  it("A row's lines name the turn, the activity and the winner", () => {
    const won = libraryRow({ gameNumber: '000004', turns: 40, winner: { seat: 1, label: 'Bob' } });
    const playing = libraryRow({ gameNumber: '000005', status: 'waiting', section: 'waiting', turns: 7 });

    expect(libraryTurnLine(won)).toBe('40 turns');
    expect(libraryWinnerLine(won)).toBe('Won by Bob');
    expect(libraryTurnLine(playing)).toBe('Turn 8');
    expect(libraryWinnerLine(playing)).toBeUndefined();
    expect(libraryTurnLine(libraryRow({ gameNumber: '000006' }))).toBeUndefined();
  });

  it('A row without a name is shown by its number', () => {
    expect(libraryRowTitle(libraryRow({ gameNumber: '000003' }))).toBe('Game 000003');
    expect(libraryRowTitle(libraryRow({ gameNumber: '000003', name: 'Friday' }))).toBe('Friday');
  });

  it('The export file is named by the game', () => {
    expect(exportFileName(undefined, '000003')).toBe('conquarrow-000003.json');
    expect(exportFileName('Friday Rematch #2!', '000003')).toBe('conquarrow-friday-rematch-2-000003.json');
    expect(exportFileName('שלום', '000003')).toBe('conquarrow-000003.json');
  });
});
