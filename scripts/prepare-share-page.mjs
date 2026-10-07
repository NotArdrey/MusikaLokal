import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

writeFileSync('web/public/share/flow.js', ts.transpileModule(readFileSync('mobile/src/utils/shareLinks.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText);
console.log('Prepared standalone share gateway; no app bundle built.');
