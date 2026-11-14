// OpenStreetMap via the public Overpass API. ODbL 1.0: this data is kept in its own file
// (plants-osm), never merged with or de-duplicated against the other sources.
// OSM says "a works is here"; the product is a suggestion. Every record is marked suggested.
import { get, clean, validLatLon, sleep } from '../lib.mjs';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
export const meta = {
  id: 'osm', name: 'OpenStreetMap', licence: 'ODbL-1.0', url: 'https://www.openstreetmap.org/copyright',
  attribution: '© OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).',
};

// One query per sector, so a busy server refuses at most one part.
const Q = {
  cement: ['nwr["industrial"="cement"]', 'nwr["man_made"="works"]["product"~"(^|;)cement($|;)"]'],
  concrete: ['nwr["industrial"="concrete_plant"]', 'nwr["man_made"="works"]["product"~"(^|;)(concrete|precast)"]'],
  lime: ['nwr["man_made"="works"]["product"~"(^|;)lime($|;)"]', 'nwr["industrial"="lime"]'],
  gypsum: ['nwr["man_made"="works"]["product"~"gypsum|plaster"]'],
  steel: ['nwr["industrial"~"^(steel_mill|steelworks)$"]', 'nwr["man_made"="works"]["product"~"(^|;)steel($|;)"]'],
  aluminium: ['nwr["man_made"="works"]["product"~"alumin"]', 'nwr["industrial"="aluminium_smelter"]'],
  glass: ['nwr["industrial"="glass"]', 'nwr["man_made"="works"]["product"~"(^|;)(glass|float_glass)"]'],
  insulation: ['nwr["man_made"="works"]["product"~"insulation|mineral_wool|rock_wool|glass_wool"]'],
  brick: ['nwr["industrial"="brickyard"]', 'nwr["man_made"="works"]["product"~"(^|;)(bricks?|tiles|ceramic_tiles)($|;)"]'],
  timber: ['nwr["craft"="sawmill"]', 'nwr["industrial"~"^(sawmill|timber)$"]', 'nwr["man_made"="works"]["product"~"(^|;)(timber|lumber|wood|plywood|clt|glulam)($|;)"]'],
  quarry: ['nwr["landuse"="quarry"]["resource"~"^(aggregate|stone|limestone|granite|sand|gravel|clay|gypsum|slate|marble|sandstone|basalt)$"]'],
};

// Overpass answers runtime errors with HTTP 200 and a remark; such an answer is incomplete.
export function checkOverpass(json, sector) {
  if (json?.remark && /error|timed out|runtime|out of memory/i.test(json.remark)) throw Error(`Overpass ${sector}: ${json.remark.slice(0, 120)}`);
  if (!Array.isArray(json?.elements)) throw Error(`Overpass ${sector}: no elements.`);
  return true;
}

export async function fetchPlants({ log }) {
  const out = [], seen = new Set();
  for (const [sector, parts] of Object.entries(Q)) {
    const query = `[out:json][timeout:600];(${parts.join(';')};);out center tags qt;`;
    const json = await get(OVERPASS, { timeout: 660000, tries: 3, init: { method: 'POST', body: new URLSearchParams({ data: query }) } });
    checkOverpass(json, sector);
    let n = 0;
    for (const e of json.elements || []) {
      const key = `${e.type[0]}${e.id}`, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (seen.has(key) || !validLatLon(lat, lon)) continue;
      seen.add(key); n++;
      const t = e.tags || {};
      out.push({
        name: clean(t.name || t['name:en'] || ''), sector, lat, lon, country: '', operator: clean(t.operator || ''),
        type: clean(t.product || t.resource || ''), capacity: null, capacityUnit: '', source: meta.id, ref: key, precision: 'exact', year: null,
      });
    }
    log(`osm ${sector}: ${n}`);
    await sleep(15000); // Overpass fair use: pause between queries
  }
  return { rows: out, version: new Date().toISOString().slice(0, 10) };
}
