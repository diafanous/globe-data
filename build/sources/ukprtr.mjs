// UK Pollutant Release and Transfer Register. Open Government Licence v3.0.
// The CSV links on the GOV.UK page change with each release, so the page is read first.
import { get, csvObjects, clean, validLatLon } from '../lib.mjs';
import { NACE } from '../sectors.mjs';

const PAGE = 'https://www.gov.uk/government/publications/download-industrial-emissions-and-waste-transfer-uk-prtr-data';
export const meta = {
  id: 'uk-prtr', name: 'UK PRTR', licence: 'OGL-UK-3.0', url: PAGE,
  attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (UK PRTR).',
};

export async function fetchPlants({ log }) {
  const html = await get(PAGE, { as: 'text' });
  const links = [...html.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+?uk_prtr_dataset_(\d{4})\.csv/g)].map(m => ({ url: m[0], year: Number(m[1]) }));
  if (!links.length) throw Error('UK PRTR: no CSV link found on the page.');
  const { url, year } = links.sort((a, b) => b.year - a.year)[0];
  const rows = csvObjects(await get(url, { as: 'text' }));
  const out = plantsFromRows(rows, year);
  log(`uk-prtr ${year}: ${out.length} of ${rows.length} rows`);
  return { rows: out, version: `reporting year ${year}` };
}

export function plantsFromRows(rows, year) {
  const out = [], seen = new Set();
  for (const r of rows) {
    const id = r.FacilityReport_NationalID, sector = NACE[clean(r.FacilityReport_NACEMainEconomicActivityCode)];
    const latText = clean(r.FacilityReport_GeographicalCoordinate_LatitudeMeasure), lonText = clean(r.FacilityReport_GeographicalCoordinate_LongitudeMeasure);
    if (!latText || !lonText) continue;
    const lat = Number(latText), lon = Number(lonText);
    if (!sector || !id || seen.has(id) || !validLatLon(lat, lon)) continue;
    seen.add(id);
    out.push({
      name: clean(r.FacilityReport_FacilityName), sector, lat, lon, country: 'GBR', operator: clean(r.FacilityReport_ParentCompanyName),
      type: clean(r.FacilityReport_MainEconomicActivityName), capacity: null, capacityUnit: '', source: meta.id, ref: id, precision: 'exact', year,
    });
  }
  return out;
}
