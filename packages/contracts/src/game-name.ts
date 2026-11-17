/**
 * Game names and the delete confirm (P96 D5, D6). One spelling for the server
 * and the lobby, so both accept exactly the same names.
 *
 * @see docs/spec/game-management/game-management.md
 */

/** Longest name, in code points, after normalising (D6). */
export const GAME_NAME_MAX = 48;

/** The exact phrase a delete must carry, and the lobby's confirm button text (D5). */
export const DELETE_GAME_CONFIRM = 'Yes, permanently delete this game';

export type GameNameResult =
  | { readonly ok: true; readonly name: string | undefined }
  | { readonly ok: false };

/**
 * D6. Absent, `null` or blank → no name. A string is NFC'd, trimmed and its
 * white-space runs collapsed; it is then valid when it has at most
 * {@link GAME_NAME_MAX} code points, each a letter, mark, digit, space or one
 * of `- _ . , : ; ! ? ' " ( ) # & + / @`.
 */
export const normalizeGameName = (value: unknown): GameNameResult => {
  void value;
  throw new Error('P96: normalizeGameName is not implemented');
};

/** What a row or the HUD calls a game: its name, else `Game {gameNumber}`. */
export const gameTitle = (name: string | undefined, gameNumber: string): string => {
  void name;
  void gameNumber;
  throw new Error('P96: gameTitle is not implemented');
};
