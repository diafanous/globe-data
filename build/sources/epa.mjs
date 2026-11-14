// US EPA Greenhouse Gas Reporting Program facilities via Envirofacts (no key). US federal data:
// no copyright in the US (17 U.S.C. 105). Selected by NAICS code.
import { get, clean, validLatLon, sleep } from '../lib.mjs';
import { NAICS } from '../sectors.mjs';

const EF = 'https://data.epa.gov/efservice';
export const meta = {
  id: 'epa-ghgrp', name: 'US EPA GHGRP', licence: 'US-PD', url: 'https://www.epa.gov/ghgreporting',
  attribution: 'US EPA Greenhouse Gas Reporting Program, via Envirofacts. US government data.',
};

export async function fetchPlants({ log }) {
  // The latest reporting year with data (the API answers 0 rows for years not yet published).
  let year = new Date().getUTCFullYear() - 1;
  for (; year > 2015; year--) {
    const c = await get(`${EF}/PUB_DIM_FACILITY/YEAR/${year}/COUNT/JSON`);
    if ((Array.isArray(c) ? c[0]?.TOTALQUERYRESULTS ?? c[0]?.totalqueryresults : c?.TOTALQUERYRESULTS) > 0) break;
  }
  const out = [], seen = new Set();
  for (const [code, sector] of Object.entries(NAICS)) {
    const rows = [], PAGE = 1000;
    for (let start = 0; ; start += PAGE) {
      const page = await get(`${EF}/PUB_DIM_FACILITY/NAICS_CODE/${code}/YEAR/${year}/ROWS/${start}:${start + PAGE - 1}/JSON`);
      if (!Array.isArray(page)) throw Error(`EPA ${code}: unexpected answer.`);
      rows.push(...page);
      if (page.length < PAGE) break;
      if (start > 100000) throw Error(`EPA ${code}: too many pages.`);
    }
    for (const r of rows) {
      if (seen.has(r.facility_id) || !validLatLon(r.latitude, r.longitude)) continue;
      seen.add(r.facility_id);
      out.push({
        name: clean(r.facility_name), sector, lat: r.latitude, lon: r.longitude, country: 'USA',
        operator: clean(String(r.parent_company || '').replace(/\s*\(\d+(\.\d+)?%\)/g, '').split(';')[0]),
        type: '', capacity: null, capacityUnit: '', source: meta.id, ref: String(r.facility_id), precision: 'exact', year,
      });
    }
    if (rows.length) log(`epa ${code} ${sector}: ${rows.length}`);
    await sleep(300);
  }
  return { rows: out, version: `reporting year ${year}` };
}
