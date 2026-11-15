import test from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, parseCsv, brotli, unbrotli, validLatLon } from '../build/lib.mjs';
import { rankOf, parseProcess } from '../build/sources/okobaudat.mjs';
import { NAICS, NACE, SECTORS } from '../build/sectors.mjs';

test('columns pack and unpack without loss', () => {
  const rows = [
    { name: 'A', sector: 'cement', lat: 31.3852071365067, lon: 119.295366914756, cap: 2e7, ref: '1' },
    { name: 'B, "quoted"', sector: '', lat: -33.9, lon: -70.12345, cap: null, ref: '2' },
    { name: '', sector: 'steel', lat: 0.000004, lon: -180, cap: 0, ref: '' },
  ];
  const t = JSON.parse(unbrotli(brotli(Buffer.from(JSON.stringify(pack(rows, { name: 's', sector: 'd', lat: 1e5, lon: 1e5, cap: 'v', ref: 's' }))))).toString());
  const back = unpack(t);
  assert.deepEqual(back.map(r => r.name), ['A', 'B, "quoted"', '']);
  assert.deepEqual(back.map(r => r.sector), ['cement', '', 'steel']);
  assert.deepEqual(back.map(r => r.lat), [31.38521, -33.9, 0]);
  assert.deepEqual(back.map(r => r.lon), [119.29537, -70.12345, -180]);
  assert.deepEqual(back.map(r => r.cap), [2e7, null, 0]);
  assert.deepEqual(t.cols.sector.d, ['cement', 'steel']);
});

test('CSV: quotes, commas, line breaks, CRLF, BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",3\n'), [['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', '3']]);
});

test('coordinates: out of range and 0,0 placeholders are refused', () => {
  assert.ok(validLatLon(51.5, -0.1));
  for (const [a, b] of [[0, 0], [91, 0], [0, 181], [NaN, 1], [null, 2]]) assert.equal(validLatLon(a, b), false);
});

test('ÖKOBAUDAT: accuracy rank and A1-A3 parsing', () => {
  assert.deepEqual(['specific dataset', 'Average dataset', 'representative dataset', 'generic dataset', 'template dataset', 'other', ''].map(rankOf), [1, 2, 3, 4, 5, 6, 6]);
  const rec = (mods, short = 'Global Warming Potential total (GWP-total)') => ({
    exchanges: { exchange: [{ referenceFlow: true, resultingflowAmount: 1000, flowProperties: [{ referenceFlowProperty: true, referenceUnit: 'kg' }] }] },
    LCIAResults: { LCIAResult: [{ referenceToLCIAMethodDataSet: { shortDescription: [{ lang: 'en', value: short }] }, other: { anies: mods } }] },
  });
  assert.deepEqual(parseProcess(rec([{ module: 'A1-A3', value: '500' }])), { gwp: 500, amount: 1000, unit: 'kg', modules: 'A1-A3', standard: 'EN 15804+A2', version: '' });
  assert.equal(parseProcess(rec([{ module: 'A1', value: '1' }, { module: 'A2', value: '2' }, { module: 'A3', value: '3' }])).gwp, 6);
  assert.equal(parseProcess(rec([{ module: 'A1-A3', value: '' }])), null);
  assert.equal(parseProcess(rec([{ module: 'C3', value: '5' }])), null);
});

test('every code maps to a known sector', () => {
  for (const s of [...Object.values(NAICS), ...Object.values(NACE)]) assert.ok(SECTORS[s], s);
});

import { plantsFromRows } from '../build/sources/ukprtr.mjs';
import { checkOverpass } from '../build/sources/osm.mjs';
import { checkTable, sha256 } from '../build/lib.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';

test('UK PRTR: blank coordinates are missing, not zero; one row per facility; sectors by NACE', () => {
  const row = (id, lat, lon, nace = '23.51') => ({ FacilityReport_NationalID: id, FacilityReport_NACEMainEconomicActivityCode: nace, FacilityReport_FacilityName: 'Works ' + id,
    FacilityReport_ParentCompanyName: 'Co', FacilityReport_MainEconomicActivityName: 'x', FacilityReport_GeographicalCoordinate_LatitudeMeasure: lat, FacilityReport_GeographicalCoordinate_LongitudeMeasure: lon });
  const out = plantsFromRows([row('A', '', '-1.5'), row('B', '52.1', ' '), row('C', '52.1', '-1.5'), row('C', '52.1', '-1.5'), row('D', '0', '-1.5'), row('E', '52', '0', '99.99')], 2024);
  assert.deepEqual(out.map(p => [p.ref, p.lat, p.lon, p.sector]), [['C', 52.1, -1.5, 'cement'], ['D', 0, -1.5, 'cement']]);
});

test('Overpass: error remarks and missing elements fail the source', () => {
  assert.ok(checkOverpass({ elements: [] }, 'x'));
  assert.throws(() => checkOverpass({ elements: [{}], remark: 'runtime error: Query timed out in "query" at line 1 after 181 seconds.' }, 'brick'), /timed out/);
  assert.throws(() => checkOverpass({ remark: 'runtime error: out of memory' }, 'quarry'), /out of memory/);
  assert.throws(() => checkOverpass({}, 'x'), /no elements/);
});

test('tables: wrong lengths and counts are refused', () => {
  assert.ok(checkTable({ n: 2, cols: { a: { s: ['x', 'y'] }, b: { d: ['p'], i: [0, -1] } } }, 2));
  assert.throws(() => checkTable({ n: 2, cols: { a: { s: ['x'] } } }, 2), /wrong length/);
  assert.throws(() => checkTable({ n: 2, cols: {} }, 3), /record count/);
  assert.throws(() => checkTable({ n: 1, cols: { b: { d: 'p', i: [0] } } }, 1), /dictionary/);
});

test('fallback records come only from a previous release whose signature and checksums verify', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const dir = mkdtempSync(join(tmpdir(), 'gd-prev-')), keyFile = join(dir, 'test.pem');
  writeFileSync(keyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  const table = pack([{ name: 'Old plant', sector: 'cement', lat: 50, lon: 10, source: 'epa-ghgrp', ref: '7' }], { name: 's', sector: 'd', lat: 1e5, lon: 1e5, source: 'd', ref: 's' });
  const buf = brotli(Buffer.from(JSON.stringify({ format: 'GLOBE-DATA', schema: 1, kind: 'plants', licence: 'x', sources: [{ id: 'epa-ghgrp', name: 'US EPA GHGRP', licence: 'US-PD' }], table })));
  const manifest = Buffer.from(JSON.stringify({ format: 'GLOBE-DATA', schema: 1, version: '2026-11-14', built: '2026-11-14T00:00:00Z', files: [{ name: 'plants.json.br', kind: 'plants', records: 1, bytes: buf.length, sha256: sha256(buf) }], sources: [] }));
  const prev = join(dir, 'prev'), run = (prevDir, out) => {
    try { execFileSync(process.execPath, ['build/build.mjs', '--only', 'none', '--previous', prevDir, '--out', out], { env: { ...process.env, GLOBE_DATA_TEST_PUBLIC_KEY: keyFile }, stdio: 'pipe' }); return true; }
    catch { return false; }
  };
  const write = (sig, file = buf) => { mkdirSync(prev, { recursive: true }); writeFileSync(join(prev, 'manifest.json'), manifest); writeFileSync(join(prev, 'manifest.sig'), sig); writeFileSync(join(prev, 'plants.json.br'), file); };
  // Valid previous release: its record is carried forward (no network: every source is skipped by --only).
  write(sign(null, manifest, privateKey).toString('base64'));
  assert.equal(run(prev, join(dir, 'out1')), true);
  const m1 = JSON.parse(readFileSync(join(dir, 'out1', 'manifest.json'), 'utf8'));
  assert.equal(m1.files.find(f => f.name === 'plants.json.br').records, 1);
  // Wrong signature, or a changed file: nothing is carried forward, so nothing is built.
  write(sign(null, manifest, generateKeyPairSync('ed25519').privateKey).toString('base64'));
  assert.equal(run(prev, join(dir, 'out2')), false); assert.ok(!existsSync(join(dir, 'out2', 'manifest.json')));
  const changed = Buffer.from(buf); changed[10] ^= 1;
  write(sign(null, manifest, privateKey).toString('base64'), changed);
  assert.equal(run(prev, join(dir, 'out3')), false);
});

import { fetchEmissions } from '../build/sources/okobaudat.mjs';
test('ÖKOBAUDAT: repeated pages fail; unreadable records keep last week\'s figure and mark the source partial', async () => {
  const real = globalThis.fetch;
  const json = body => new Response(JSON.stringify(body), { status: 200 });
  try {
    // No total count, and the server ignores the offset: the same dataset comes back again.
    globalThis.fetch = async url => json({ data: String(url).includes('startIndex=0') || String(url).includes('startIndex=1') ? [{ uuid: 'u1', name: 'A' }] : [] });
    await assert.rejects(fetchEmissions({ log: () => {} }), /repeats earlier datasets/);
    // One new and one changed dataset; both detail reads fail. The changed one keeps its earlier row.
    globalThis.fetch = async url => String(url).includes('/processes?')
      ? json({ totalCount: 2, data: String(url).includes('startIndex=0') ? [{ uuid: 'new', name: 'New', version: '1' }, { uuid: 'old', name: 'Old', version: '2' }] : [] })
      : new Response('gone', { status: 404 });
    const previous = new Map([['old', { uuid: 'old', version: '1', name: 'Old', gwp: 5, amount: 1, unit: 'kg' }]]);
    const r = await fetchEmissions({ log: () => {}, previous });
    assert.deepEqual(r.rows.map(x => x.uuid), ['old']);
    assert.deepEqual(r.partial, { failedRecords: 2, keptRecords: 1 });
  } finally { globalThis.fetch = real; }
});

test('tables: the build refuses what the app refuses (dictionary of numbers, bad scale, unknown kind)', () => {
  assert.throws(() => checkTable({ n: 1, cols: { source: { d: [7], i: [0] } } }, 1), /dictionary of text/);
  assert.throws(() => checkTable({ n: 1, cols: { lat: { q: -1e5, i: [1] } } }, 1), /scale/);
  assert.throws(() => checkTable({ n: 1, cols: { x: { w: [1] } } }, 1), /no known kind|wrong length/);
  assert.throws(() => checkTable({ n: 1, cols: { lat: { q: 1e5, i: ['1'] } } }, 1), /not a number/);
});
