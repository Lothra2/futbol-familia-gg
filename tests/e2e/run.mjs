// Runs the browser suites one after another. Each suite starts its own preview server on port 4173, so they cannot run in parallel.
import { spawnSync } from 'node:child_process';
const suites = process.argv.slice(2).length ? process.argv.slice(2) : ['smoke', 'match', 'input', 'animation', 'views', 'menu', 'cine', 'goalcine', 'cup', 'modes', 'audio', 'narrator', 'replay', 'guide', 'crowd', 'art2'];
let bad = 0;
for (const s of suites) {
  console.log(`\n=== ${s}`);
  const r = spawnSync('node', [`tests/e2e/${s}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) { bad++; console.log(`=== ${s} FAILED`); }
}
console.log(bad ? `\n${bad} suite(s) failed` : '\nall suites passed');
process.exit(bad ? 1 : 0);
