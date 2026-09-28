function dirname(path) {
  const normalized = String(path || '').replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

export function resolvePackagePath(basePath, target) {
  const raw = String(target || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return null;
  }

  const targetPath = raw.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  const combined = [dirname(basePath), targetPath].filter(Boolean).join('/');
  const segments = [];

  for (const segment of combined.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join('/') || null;
}

export function findDocumentationPath(files) {
  const paths = (files || []).map(file => file.path).filter(Boolean);
  const findDefinition = (name) => paths.find(path => path === name)
    || paths.find(path => path.split('/').pop() === name);

  const definition = findDefinition('skill.yaml') || findDefinition('SKILL.md');
  if (!definition) return paths.find(path => path.split('/').pop()?.toLowerCase() === 'readme.md') || null;

  const definitionDir = dirname(definition);
  const siblingReadme = paths.find(path => (
    dirname(path) === definitionDir && path.split('/').pop()?.toLowerCase() === 'readme.md'
  ));

  return siblingReadme || findDefinition('SKILL.md') || definition;
}
