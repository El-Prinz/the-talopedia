// Projections for the 1936 pick'em: every entry scored against every World Cup the football engine played
// out on the cloud runners (test/wc1936.mjs in the engine, one JSON line a tournament). Writes
// src/content/data/pickem-wc1936-projection.json: for each entrant the average points (Proj.) and the share
// of tournaments in which that entry tops the pick'em (Win). A shared award is split between the men level on
// it; a pick'em tie that survives both tiebreakers is split between the entries in it.
//
//   node scripts/project-pickem-wc1936.mjs <tournaments.jsonl> [label]
//
// Each entry's code is kept beside its numbers, so a pick changed after the run shows no projection until the
// next run rather than a stale one.
import fs from 'node:fs';
import path from 'node:path';
import * as K from '../src/lib/pickem/wc1936.js';

const [file, label] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/project-pickem-wc1936.mjs <tournaments.jsonl> [label]'); process.exit(2); }
const data = JSON.parse(fs.readFileSync('src/content/data/pickem-wc1936.json', 'utf8'));
const dir = 'src/content/data/pickem-wc1936/entries';
const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
  const code = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).code;
  return { login: f.replace(/\.json$/, ''), code, m: K.decode(code, data) };
});
const sims = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (!sims.length) throw new Error('no tournaments in ' + file);

const acc = new Map(entries.map((e) => [e.login, { pts: 0, win: 0, groups: 0, ko: 0, dark: 0, awards: 0 }]));
for (const s of sims) {
  const r = { groups: s.g, ko: s.ko, score: s.sc, awards: { boot: null, ball: null, glove: null },
    done: Object.fromEntries(K.GROUP_KEYS.map((g) => [g, true])) };
  const won = { boot: s.boot, ball: s.ball ? [s.ball] : [], glove: s.glove };
  const rows = entries.map((e) => {
    const o = K.scoreEntry(e.m, r);
    o.awards = K.AWARDS.reduce((t, k) => t + (won[k].includes(e.m.awards[k]) ? K.POINTS.award / won[k].length : 0), 0);
    o.total += o.awards;
    return { e, o };
  });
  for (const { e, o } of rows) {
    const a = acc.get(e.login);
    a.pts += o.total; a.groups += o.groups; a.ko += o.ko; a.dark += o.dark; a.awards += o.awards;
  }
  // The leaderboard's own order: points, the exact final score, the closest total goals.
  const best = rows.reduce((b, x) => (!b || x.o.total - b.o.total > 1e-9
    || (Math.abs(x.o.total - b.o.total) < 1e-9 && (x.o.exact > b.o.exact || (x.o.exact === b.o.exact && x.o.gap < b.o.gap))) ? x : b), null);
  const top = rows.filter((x) => Math.abs(x.o.total - best.o.total) < 1e-9 && x.o.exact === best.o.exact && x.o.gap === best.o.gap);
  for (const x of top) acc.get(x.e.login).win += 1 / top.length;
}

const n = sims.length, r1 = (v) => Math.round(v * 10) / 10;
const out = {
  sims: n, label: label || null, at: new Date().toISOString().slice(0, 10),
  entries: Object.fromEntries(entries.map((e) => {
    const a = acc.get(e.login);
    return [e.login, { code: e.code, proj: r1(a.pts / n), win: Math.round((a.win / n) * 1000) / 1000,
      groups: r1(a.groups / n), ko: r1(a.ko / n), dark: r1(a.dark / n), awards: r1(a.awards / n) }];
  })),
};
fs.writeFileSync('src/content/data/pickem-wc1936-projection.json', JSON.stringify(out, null, 1) + '\n');
for (const e of [...entries].sort((x, y) => out.entries[y.login].proj - out.entries[x.login].proj))
  console.log(e.m.name.padEnd(14), String(out.entries[e.login].proj).padStart(5), `${(out.entries[e.login].win * 100).toFixed(1)}%`.padStart(7));
console.log(`${n} tournaments`);
