// Signs dist/manifest.json with Ed25519. The private key comes from the environment
// (GitHub secret GLOBE_DATA_SIGNING_KEY: PKCS#8 PEM), never from the repository.
// The app holds the public key (keys/public.pem) and refuses data whose signature fails.
import { readFile, writeFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const pem = process.env.GLOBE_DATA_SIGNING_KEY;
if (!pem) { console.error('GLOBE_DATA_SIGNING_KEY is not set.'); process.exit(1); }
const key = createPrivateKey(pem);
const manifest = await readFile('dist/manifest.json');
const sig = sign(null, manifest, key);
const pub = createPublicKey(await readFile('keys/public.pem', 'utf8'));
if (!verify(null, manifest, pub, sig)) { console.error('The signing key does not match keys/public.pem.'); process.exit(1); }
await writeFile('dist/manifest.sig', sig.toString('base64') + '\n');
console.log('signed dist/manifest.json');
