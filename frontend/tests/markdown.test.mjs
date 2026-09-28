import test from 'node:test';
import assert from 'node:assert/strict';

import { findDocumentationPath, resolvePackagePath } from '../src/utils/markdown.mjs';

test('resolves markdown links relative to the package documentation file', () => {
  assert.equal(
    resolvePackagePath('ppt-master/SKILL.md', 'workflows/create-template.md'),
    'ppt-master/workflows/create-template.md',
  );
  assert.equal(
    resolvePackagePath('ppt-master/docs/README.md', '../assets/preview.png'),
    'ppt-master/assets/preview.png',
  );
  assert.equal(resolvePackagePath('SKILL.md', 'https://example.com/docs'), null);
});

test('selects README next to the skill definition without picking nested unrelated docs', () => {
  const files = [
    { path: 'demo/SKILL.md' },
    { path: 'demo/README.md' },
    { path: 'demo/templates/README.md' },
  ];

  assert.equal(findDocumentationPath(files), 'demo/README.md');
});
