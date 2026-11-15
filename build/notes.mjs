// Release notes: what each file holds and where each source stands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const m = JSON.parse(readFileSync(join(process.argv[2] || 'dist', 'manifest.json'), 'utf8'));
const lines = [`GLOBE data ${m.version}. Schema ${m.schema}. Licences and credits: ATTRIBUTION.md in the repository.`, '', '| File | Records | Size | Licence |', '|---|---|---|---|'];
for (const f of m.files) lines.push(`| ${f.name} | ${f.records} | ${(f.bytes / 1e6).toFixed(2)} MB | ${f.licence} |`);
lines.push('', '| Source | Version | Records | State |', '|---|---|---|---|');
for (const s of m.sources) lines.push(`| ${s.name} | ${s.version} | ${s.records} | ${s.failedRecords ? `fetched ${s.retrieved}; ${s.failedRecords} records could not be read (${s.keptRecords} kept from the previous release)` : s.stale ? 'kept from the previous release (fetch failed)' : `fetched ${s.retrieved}`} |`);
console.log(lines.join('\n'));
