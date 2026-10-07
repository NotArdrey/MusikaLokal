import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const requireMobile = createRequire(new URL('../mobile/package.json', import.meta.url));
const env = requireMobile('dotenv').parse(readFileSync('.env'));
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
assert.equal(new URL(url).protocol, 'https:');
assert.ok(anonKey);
if (anonKey.startsWith('ey')) {
  assert.equal(JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url')).role, 'anon');
} else {
  assert.ok(anonKey.startsWith('sb_publishable_'));
}
const source = readFileSync('mobile/src/utils/passwordRecovery.ts', 'utf8');
assert.equal(readFileSync('web/src/utils/passwordRecovery.ts', 'utf8'), source);
writeFileSync('web/public/recovery/flow.js', ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText);
writeFileSync('web/public/recovery/config.js', `export const config = ${JSON.stringify({ url, anonKey })};\n`);
console.log('Prepared standalone recovery files using only the public Supabase configuration. No app bundle built.');
