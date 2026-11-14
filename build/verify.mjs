// Checks a built or downloaded release the way the app does: signature, hashes, schema, contents.
// Usage: node build/verify.mjs <folder>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { sha256, unbrotli, unpack, checkTable } from './lib.mjs';
import { SCHEMA } from './build.mjs';

const dir = process.argv[2] || 'dist';
const manifestBytes = await readFile(join(dir, 'manifest.json'));
const sig = Buffer.from((await readFile(join(dir, 'manifest.sig'), 'utf8')).trim(), 'base64');
const pub = createPublicKey(await readFile(new URL('../keys/public.pem', import.meta.url), 'utf8'));
if (!verify(null, manifestBytes, pub, sig)) throw Error('Signature does not match.');
const m = JSON.parse(manifestBytes);
if (m.format !== 'GLOBE-DATA' || m.schema !== SCHEMA) throw Error('Unexpected manifest format or schema.');
for (const f of m.files) {
  const buf = await readFile(join(dir, f.name));
  if (buf.length !== f.bytes || sha256(buf) !== f.sha256) throw Error(`${f.name}: hash or size does not match.`);
  const body = JSON.parse(unbrotli(buf).toString('utf8'));
  if (body.format !== 'GLOBE-DATA' || body.schema !== SCHEMA || body.kind !== f.kind) throw Error(`${f.name}: wrong format, schema or kind.`);
  checkTable(body.table, f.records);
  // The same content rules the app applies before using a release.
  const need = f.kind === 'plants' ? ['name', 'sector', 'lat', 'lon', 'source', 'ref'] : ['uuid', 'name', 'gwp', 'amount', 'unit'];
  for (const c of need) if (!body.table.cols[c]) throw Error(`${f.name}: column ${c} is missing.`);
  for (const r of unpack(body.table)) {
    if (f.kind === 'plants' && !(r.source && typeof r.ref === 'string' && r.lat >= -90 && r.lat <= 90 && r.lon >= -180 && r.lon <= 180)) throw Error(`${f.name}: a plant has no valid location.`);
    if (f.kind === 'emissions' && !(r.uuid && Number.isFinite(r.gwp) && r.amount > 0 && r.unit)) throw Error(`${f.name}: a record has no valid figure.`);
  }
}
console.log(`verified ${m.version}: ${m.files.map(f => `${f.name} ${f.records}`).join(', ')}`);
