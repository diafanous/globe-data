// Shared helpers for the weekly build. Node 22+, no dependencies.
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';

export const USER_AGENT = 'globe-data-build/1 (+https://github.com/diafanous/globe-data)';
export const today = () => new Date().toISOString().slice(0, 10);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// fetch with a project User-Agent, a timeout and a few retries for busy servers.
export async function get(url, { tries = 3, timeout = 120000, as = 'json', init = {} } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { 'user-agent': USER_AGENT, ...(init.headers || {}) }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 429 || r.status >= 500) throw Error(`HTTP ${r.status}`);
      if (!r.ok) { const e = Error(`HTTP ${r.status} for ${url.split('?')[0]}`); e.fatal = true; throw e; }
      return as === 'json' ? await r.json() : as === 'text' ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; if (e.fatal) break; await sleep(5000 * (i + 1)); }
  }
  throw last;
}

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes.
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x !== ''));
}
export const csvObjects = text => { const [h, ...rows] = parseCsv(text); return rows.map(r => Object.fromEntries(h.map((k, i) => [k.trim(), r[i] ?? '']))); };

// Column-oriented table. Each column is one of:
//   { s: [...] }            plain strings
//   { d: [dict], i: [...] } dictionary: index into d, -1 for empty
//   { q: scale, i: [...] }  number stored as round(value * scale), null for missing
//   { v: [...] }            plain JSON values
export function pack(rows, spec) {
  const cols = {};
  for (const [key, kind] of Object.entries(spec)) {
    const vals = rows.map(r => r[key]);
    if (kind === 's') cols[key] = { s: vals.map(v => v == null ? '' : String(v)) };
    else if (kind === 'd') {
      const dict = [...new Set(vals.filter(v => v != null && v !== '').map(String))].sort();
      const at = new Map(dict.map((v, i) => [v, i]));
      cols[key] = { d: dict, i: vals.map(v => v == null || v === '' ? -1 : at.get(String(v))) };
    } else if (typeof kind === 'number') cols[key] = { q: kind, i: vals.map(v => Number.isFinite(v) ? Math.round(v * kind) : null) };
    else cols[key] = { v: vals.map(v => v ?? null) };
  }
  return { n: rows.length, cols };
}
export function unpack(table) {
  const out = Array.from({ length: table.n }, () => ({}));
  for (const [key, c] of Object.entries(table.cols)) for (let k = 0; k < table.n; k++)
    out[k][key] = c.s ? c.s[k] : c.d ? (c.i[k] < 0 ? '' : c.d[c.i[k]]) : c.q ? (c.i[k] == null ? null : c.i[k] / c.q) : c.v[k];
  return out;
}

// A table is well formed: every column the right length and kind.
export function checkTable(table, records) {
  if (!table || !Number.isInteger(table.n) || table.n !== records || !table.cols) throw Error('Table does not match its record count.');
  for (const [k, c] of Object.entries(table.cols)) {
    const list = c.s || c.i || c.v;
    if (!Array.isArray(list) || list.length !== table.n) throw Error(`Column ${k} is the wrong length.`);
    if (c.d && !Array.isArray(c.d)) throw Error(`Column ${k} has no dictionary.`);
  }
  return true;
}

export const brotli = buf => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
export const unbrotli = buf => brotliDecompressSync(buf);
export const sha256 = buf => createHash('sha256').update(buf).digest('hex');

export const validLatLon = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
export const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
