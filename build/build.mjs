// Weekly build: fetch each source, pack, compress, write dist/ and the manifest.
// A source that fails keeps its data from the previous release (marked stale), so one outage
// never empties the database. Usage: node build/build.mjs [--only id,id] [--previous dir]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pack, unpack, brotli, unbrotli, sha256, get, today } from './lib.mjs';
import { SECTORS } from './sectors.mjs';
import * as climatetrace from './sources/climatetrace.mjs';
import * as epa from './sources/epa.mjs';
import * as ukprtr from './sources/ukprtr.mjs';
import * as osm from './sources/osm.mjs';
import * as okobaudat from './sources/okobaudat.mjs';

export const SCHEMA = 1;
export const RELEASES = 'https://github.com/diafanous/globe-data/releases/latest/download';
const PLANT_SPEC = { name: 's', sector: 'd', lat: 1e5, lon: 1e5, country: 'd', operator: 'd', type: 'd', capacity: 'v', capacityUnit: 'd', source: 'd', ref: 's', precision: 'd', year: 'v' };
const EMISSION_SPEC = { uuid: 's', version: 'd', name: 's', owner: 'd', type: 'd', rank: 'v', category: 'd', geo: 'd', year: 'v', validUntil: 'v', gwp: 'v', amount: 'v', unit: 'd', modules: 'd', standard: 'd' };

// Each output file holds sources under compatible licences only (see ATTRIBUTION.md).
const FILES = [
  { file: 'plants.json.br', kind: 'plants', sources: [climatetrace, epa, ukprtr], spec: PLANT_SPEC, licence: 'CC-BY-4.0 (Climate TRACE), OGL-UK-3.0 (UK PRTR), US public domain (EPA)' },
  { file: 'plants-osm.json.br', kind: 'plants', sources: [osm], spec: PLANT_SPEC, licence: 'ODbL-1.0' },
  { file: 'emissions.json.br', kind: 'emissions', sources: [okobaudat], spec: EMISSION_SPEC, licence: 'ÖKOBAUDAT terms of use' },
];

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const prevDir = args.includes('--previous') ? args[args.indexOf('--previous') + 1] : null;
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

// The previous release, from a local folder or from GitHub.
async function previousFile(name) {
  try { return prevDir ? await readFile(join(prevDir, name)) : await get(`${RELEASES}/${name}`, { as: 'buffer', tries: 2 }); }
  catch { return null; }
}
async function previousTable(name) {
  const buf = await previousFile(name);
  return buf ? JSON.parse(unbrotli(buf).toString('utf8')) : null;
}

export async function build(out = 'dist') {
  await mkdir(out, { recursive: true });
  const prevManifest = await previousFile('manifest.json').then(b => b && JSON.parse(b.toString('utf8'))).catch(() => null);
  const manifest = { format: 'GLOBE-DATA', schema: SCHEMA, version: today(), built: new Date().toISOString(), minApp: '0.1.0', sectors: SECTORS, files: [], sources: [] };
  let failures = 0;
  for (const f of FILES) {
    const prev = await previousTable(f.file);
    const prevRows = prev ? unpack(prev.table) : [];
    const rows = [], sources = [];
    for (const src of f.sources) {
      const m = src.meta, before = prev?.sources?.find(s => s.id === m.id);
      if (only && !only.includes(m.id)) { if (before) { rows.push(...prevRows.filter(r => (r.source ?? m.id) === m.id)); sources.push(before); } continue; }
      try {
        const previous = new Map(prevRows.filter(r => r.uuid).map(r => [r.uuid, r]));
        const r = f.kind === 'emissions' ? await src.fetchEmissions({ log, previous }) : await src.fetchPlants({ log });
        if (!r.rows.length) throw Error('no records');
        rows.push(...r.rows);
        sources.push({ ...m, version: r.version, retrieved: today(), records: r.rows.length, stale: false });
      } catch (e) {
        failures++; log(`${m.id} FAILED: ${e.message}`);
        if (before) { rows.push(...prevRows.filter(r => f.kind === 'emissions' || r.source === m.id)); sources.push({ ...before, stale: true }); }
      }
    }
    if (!rows.length) { log(`${f.file}: nothing to write`); continue; }
    const body = JSON.stringify({ format: 'GLOBE-DATA', schema: SCHEMA, kind: f.kind, licence: f.licence, sources, table: pack(rows, f.spec) });
    const buf = brotli(Buffer.from(body));
    await writeFile(join(out, f.file), buf);
    manifest.files.push({ name: f.file, kind: f.kind, licence: f.licence, records: rows.length, bytes: buf.length, sha256: sha256(buf) });
    manifest.sources.push(...sources.map(s => ({ id: s.id, name: s.name, licence: s.licence, file: f.file, version: s.version, retrieved: s.retrieved, records: s.records, stale: s.stale, attribution: s.attribution, url: s.url })));
    log(`${f.file}: ${rows.length} records, ${(buf.length / 1e6).toFixed(2)} MB`);
  }
  if (!manifest.files.length) throw Error('Every source failed; nothing was built.');
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  return { manifest, failures, previous: prevManifest?.version ?? null };
}

if (process.argv[1]?.endsWith('build.mjs')) {
  build().then(r => { log(`built ${r.manifest.version}: ${r.manifest.files.map(f => `${f.name} ${f.records}`).join(', ')}; ${r.failures} source failures`); })
    .catch(e => { console.error(e); process.exit(1); });
}
