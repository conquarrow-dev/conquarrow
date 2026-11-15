/**
 * `pnpm board-map` runner (P93). I/O only: read the input, hand it to
 * `parseBoardView` and `boardMap`, print.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { boardMap, parseBoardView } from '../packages/byok-offer/src/index.ts';

const fail = (message: string): never => {
  process.stderr.write(`pnpm board-map: ${message}\n`);
  process.exit(1);
};

const file = process.argv[2];
const raw = readFileSync(file ?? 0, 'utf8');

let json: unknown;
try {
  json = JSON.parse(raw) as unknown;
} catch {
  fail('input is not JSON; pass a board, or an observe or move result made with board "json" or "both"');
}

const board = parseBoardView(json);
if (board === undefined) fail('input has no board; pass a board, or an observe or move result made with board "json" or "both"');
else {
  try {
    process.stdout.write(boardMap(board));
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
