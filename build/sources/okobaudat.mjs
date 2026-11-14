// ÖKOBAUDAT (German federal building-materials database, soda4LCA / ILCD+EPD). Keyless REST.
// The publisher states the data are free of charge; the exact licence wording is still to be
// confirmed (oekobaudat.de could not be reached when this was written). All datasets are included
// (user decision, 2026-11-14), each with its dataset type so the app ranks them by accuracy.
import { get, clean, sleep } from '../lib.mjs';

const BASE = 'https://oekobaudat.de/OEKOBAU.DAT/resource';
export const meta = {
  id: 'okobaudat', name: 'ÖKOBAUDAT', licence: 'OKOBAUDAT-TERMS', url: 'https://www.oekobaudat.de',
  attribution: 'ÖKOBAUDAT, Federal Ministry for Housing, Urban Development and Building (BMWSB), Germany.',
};

// Accuracy order of ILCD+EPD dataset types: a plant's own EPD first, a generic or template value last.
export const RANK = { 'specific dataset': 1, 'average dataset': 2, 'representative dataset': 3, 'generic dataset': 4, 'template dataset': 5 };
export const rankOf = type => RANK[String(type || '').toLowerCase().trim()] ?? 6;

const text = (list, lang = 'en') => Array.isArray(list) ? (list.find(x => x.lang === lang && x.value) || list.find(x => x.value))?.value ?? '' : '';

// Same rules as the app's live lookup (GLOBE src/core/okobaudat.mjs parseProcess).
export function parseProcess(json) {
  const ref = (json?.exchanges?.exchange || []).find(e => e.referenceFlow) || (json?.exchanges?.exchange || [])[0];
  const prop = (ref?.flowProperties || []).find(p => p.referenceFlowProperty) || (ref?.flowProperties || [])[0];
  const amount = ref?.resultingflowAmount != null ? Number(ref.resultingflowAmount) : Number(ref?.meanAmount ?? 1) * Number(prop?.meanValue ?? 1);
  const unit = prop?.referenceUnit || '';
  const results = json?.LCIAResults?.LCIAResult || [];
  const label = r => text(r?.referenceToLCIAMethodDataSet?.shortDescription);
  const pick = results.find(r => /GWP-total/i.test(label(r))) || results.find(r => /global warming potential/i.test(label(r)) && !/fossil|biogen|luluc/i.test(label(r)));
  if (!pick) return null;
  const byModule = new Map((pick.other?.anies || []).filter(a => a.module && a.value != null && String(a.value).trim() !== '').map(a => [a.module, Number(a.value)]));
  let gwp, modules;
  if (Number.isFinite(byModule.get('A1-A3'))) { gwp = byModule.get('A1-A3'); modules = 'A1-A3'; }
  else if (['A1', 'A2', 'A3'].every(m => Number.isFinite(byModule.get(m)))) { gwp = byModule.get('A1') + byModule.get('A2') + byModule.get('A3'); modules = 'A1+A2+A3'; }
  else return null;
  if (!unit || !Number.isFinite(amount) || amount <= 0) return null;
  return { gwp, amount, unit, modules, standard: /GWP-total/i.test(label(pick)) ? 'EN 15804+A2' : 'EN 15804+A1',
    version: json?.administrativeInformation?.publicationAndOwnership?.dataSetVersion || '' };
}

// previous: Map uuid -> row from the last release, reused when the dataset version is unchanged.
export async function fetchEmissions({ log, previous = new Map() }) {
  // Page by what the server actually returns, until its total is reached or a page comes back empty.
  const list = []; let total = null;
  for (let start = 0; ; ) {
    const page = await get(`${BASE}/processes?format=json&pageSize=500&startIndex=${start}&lang=en`, { timeout: 180000 });
    const data = Array.isArray(page?.data) ? page.data : null;
    if (!data) throw Error('ÖKOBAUDAT: unexpected list answer.');
    if (Number.isInteger(page.totalCount)) total = page.totalCount;
    list.push(...data.filter(d => d.uuid && d.name));
    start += data.length;
    if (!data.length || (total != null && start >= total)) break;
    if (start > 200000) throw Error('ÖKOBAUDAT: too many pages.');
  }
  if (total != null && list.length < total * 0.98) throw Error(`ÖKOBAUDAT: listed ${list.length} of ${total} datasets.`);
  log(`okobaudat: ${list.length} datasets listed${total != null ? ` of ${total}` : ''}`);
  const rows = []; let fetched = 0, reused = 0, skipped = 0, failed = 0, kept = 0, i = 0;
  async function worker() {
    while (i < list.length) {
      const d = list[i++], before = previous.get(d.uuid);
      if (before && before.version === (d.version || '')) { rows.push(before); reused++; continue; }
      try {
        const p = parseProcess(await get(`${BASE}/processes/${d.uuid}?format=json&view=extended`, { timeout: 60000 }));
        if (!p) { skipped++; continue; } // the record has no A1-A3 figure: correctly left out
        fetched++;
        rows.push({ uuid: d.uuid, version: d.version || p.version, name: clean(d.name), owner: clean(d.owner), type: clean(d.subType || d.type),
          rank: rankOf(d.subType || d.type), category: clean(d.classific), geo: clean(d.geo), year: Number(d.refYear) || null,
          validUntil: Number(d.validUntil) || null, gwp: p.gwp, amount: p.amount, unit: p.unit, modules: p.modules, standard: p.standard });
      } catch {
        // Unreachable record: keep last week's verified row if there is one, marked as kept; never drop it silently.
        failed++;
        if (before) { rows.push({ ...before }); kept++; }
      }
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  log(`okobaudat: ${fetched} read, ${reused} unchanged, ${skipped} without an A1-A3 figure, ${failed} unreachable (${kept} kept from the last release)`);
  if (failed > Math.max(20, list.length * 0.02)) throw Error(`ÖKOBAUDAT: ${failed} records could not be read.`);
  rows.sort((a, b) => a.uuid.localeCompare(b.uuid));
  return { rows, version: `${list.length} datasets`, staleRecords: kept };
}
