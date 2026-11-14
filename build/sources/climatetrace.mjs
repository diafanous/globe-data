// Climate TRACE asset-level data. CC BY 4.0 (https://climatetrace.org/terms). Key-free API v7.
// "Climate TRACE" is a trademark of WattTime: credited, never presented as an endorsement.
import { get, clean, validLatLon } from '../lib.mjs';

const API = 'https://api.climatetrace.org/v7';
export const meta = {
  id: 'climatetrace', name: 'Climate TRACE', licence: 'CC-BY-4.0', url: 'https://climatetrace.org',
  attribution: 'Climate TRACE (climatetrace.org), CC BY 4.0. Selected sectors, coordinates rounded.',
};

const SUBSECTORS = { cement: 'cement', 'iron-and-steel': 'steel', aluminum: 'aluminium', glass: 'glass', lime: 'lime', 'other-manufacturing': null };
// "Other manufacturing" mixes many industries; only these asset types are building materials.
const OTHER = [[/gypsum/i, 'gypsum'], [/clay building|brick|ceramic/i, 'brick'], [/mineral wool/i, 'insulation'], [/glass/i, 'glass']];

export async function fetchPlants({ log }) {
  const md = await get(`${API}/metadata`), version = md?.dataVersion ?? md?.version ?? '';
  const year = new Date().getUTCFullYear() - 1;
  const out = [];
  for (const [sub, fixed] of Object.entries(SUBSECTORS)) {
    let rows = [];
    for (const y of [year, year - 1]) { rows = await get(`${API}/sources?subsectors=${sub}&year=${y}&limit=10000`); if (rows.length) break; }
    if (rows.length >= 10000) throw Error(`Climate TRACE ${sub}: the page limit was reached; paging is needed.`);
    for (const r of rows) {
      const sector = fixed ?? OTHER.find(([re]) => re.test(r.assetType || ''))?.[1];
      const lat = r.centroid?.latitude, lon = r.centroid?.longitude;
      if (!sector || !validLatLon(lat, lon)) continue;
      out.push({
        name: clean(r.name), sector, lat, lon, country: r.country || '', operator: '',
        type: r.assetType && r.assetType !== 'unknown' ? clean(r.assetType) : '',
        capacity: Number.isFinite(r.capacity) ? r.capacity : null, capacityUnit: r.capacity != null ? clean(r.capacityUnits) : '',
        source: meta.id, ref: String(r.id), precision: 'unstated', year: r.year ?? null,
      });
    }
    log(`climatetrace ${sub}: ${rows.length}`);
  }
  return { rows: out, version: String(version) };
}
