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
