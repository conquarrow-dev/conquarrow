#!/usr/bin/env node
/**
 * `pnpm board-map [file]` (P93): print the text map of a board.
 *
 * Input: a full `observe` result (`{ stop, offer, board }`) or a bare board,
 * from the file argument or stdin. Loads workspace TypeScript via vite-node,
 * the same resolver as Vitest and `pnpm bots`.
 *
 * @see docs/spec/agent-board-map/agent-board-map.md
 */
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const viteNodeCli = () => {
  const pnpm = join(root, 'node_modules/.pnpm');
  if (existsSync(pnpm)) {
    const dir = readdirSync(pnpm).find((name) => name.startsWith('vite-node@'));
    if (dir !== undefined) {
      const cli = join(pnpm, dir, 'node_modules/vite-node/vite-node.mjs');
      if (existsSync(cli)) return cli;
    }
  }
  const nested = join(root, 'node_modules/vite-node/vite-node.mjs');
  return existsSync(nested) ? nested : undefined;
};

const cli = viteNodeCli();
if (cli === undefined) {
  console.error('pnpm board-map: vite-node not found (install deps with pnpm)');
  process.exit(1);
}
const runner = join(root, 'scripts/board-map-run.ts');
const file = process.argv[2];
const args = file === undefined ? [] : [resolve(process.cwd(), file)];
const result = spawnSync(process.execPath, [cli, runner, ...args], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, NODE_NO_WARNINGS: '1' },
});
process.exit(result.status === null ? 1 : result.status);
