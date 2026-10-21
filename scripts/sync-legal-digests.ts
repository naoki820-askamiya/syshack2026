import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { legalDraftNotice, termsDocument, privacyDocument } from '../src/app/legal/documents.js';

const path = 'src/shared/legal.ts';
const original = readFileSync(path, 'utf8');
let updated = original;
for (const [name, document] of [['TERMS_CONTENT_SHA256', termsDocument], ['PRIVACY_CONTENT_SHA256', privacyDocument]] as const) {
  const digest = createHash('sha256').update(JSON.stringify({ title: document.title, notice: legalDraftNotice, sections: document.sections })).digest('hex');
  const pattern = new RegExp(`(export const ${name} = ')[a-f0-9]{64}(';?)`);
  if (!pattern.test(updated)) throw new Error(`Digest declaration missing: ${name}`);
  updated = updated.replace(pattern, `$1${digest}$2`);
}
if (process.argv.includes('--check')) {
  if (updated !== original) {
    console.error('規約本文とハッシュが一致しません。npm run legal:sync を実行してください。');
    process.exitCode = 1;
  }
} else if (updated !== original) {
  writeFileSync(path, updated, 'utf8');
  console.log('規約本文のハッシュを同期しました。変更内容と同意バージョンを確認してください。');
}
