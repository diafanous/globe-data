// Checks a built or downloaded release the way the app does: signature, hashes, schema, contents.
// Usage: node build/verify.mjs <folder>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { sha256, unbrotli } from './lib.mjs';
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
  if (body.table.n !== f.records) throw Error(`${f.name}: record count does not match.`);
  for (const [k, c] of Object.entries(body.table.cols)) if ((c.s || c.i || c.v).length !== f.records) throw Error(`${f.name}: column ${k} is the wrong length.`);
}
console.log(`verified ${m.version}: ${m.files.map(f => `${f.name} ${f.records}`).join(', ')}`);
