# globe-data

Weekly database of building-material plants and production emissions for the GLOBE material
sourcing atlas. Built every Monday by GitHub Actions and published as a release.

## Files in each release

- `manifest.json`: version, schema, file hashes and source status.
- `manifest.sig`: Ed25519 signature of `manifest.json` (public key: `keys/public.pem`).
- `plants.json.br`: plants from Climate TRACE, US EPA GHGRP and UK PRTR (CC BY 4.0 with credits).
- `plants-osm.json.br`: plants and quarries from OpenStreetMap (ODbL 1.0, separate file).
- `emissions.json.br`: A1-A3 figures from ÖKOBAUDAT, with an accuracy rank per record.

Licences and credits: `ATTRIBUTION.md`.

The latest files are always at
`https://github.com/diafanous/globe-data/releases/latest/download/<file>`.

## Format

Each `.json.br` file is Brotli-compressed JSON:
`{ format: "GLOBE-DATA", schema, kind, licence, sources: [...], table: { n, cols } }`.
Each column is one of `{ s: [strings] }`, `{ d: [dictionary], i: [indexes, -1 = empty] }`,
`{ q: scale, i: [whole numbers or null] }` (value = i / q; coordinates use 1e5) or `{ v: [values] }`.

## Build

1. Install Node 22 or later. No packages are needed.
2. Run `node --test tests/*.test.mjs`.
3. Run `node build/build.mjs`. Add `--only climatetrace,epa-ghgrp` to fetch some sources only.
4. Set `GLOBE_DATA_SIGNING_KEY` to the private key (PKCS#8 PEM) and run `node build/sign.mjs`.
5. Run `node build/verify.mjs dist`.

A source that fails keeps its data from the previous release and is marked stale in the manifest.
