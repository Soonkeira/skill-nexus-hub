import { strFromU8, unzipSync } from 'fflate';

function unquoteYamlScalar(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function setMetadataValue(metadata, key, value) {
  if (key === 'name' || key === 'version' || key === 'description') {
    metadata[key] = unquoteYamlScalar(value);
  }
}

function parseSkillDefinitionYaml(content) {
  const metadata = {};
  const lines = String(content || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const scalar = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (!scalar) continue;

    const key = scalar[1];
    const value = scalar[2];
    if (value === '>' || value === '|') {
      const block = [];
      let next = i + 1;
      while (next < lines.length) {
        const line = lines[next];
        if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
        if (line.trim()) block.push(line.trim());
        next += 1;
      }
      setMetadataValue(metadata, key, value === '>' ? block.join(' ') : block.join('\n'));
      i = next - 1;
      continue;
    }

    if (!value || value.startsWith('[')) continue;
    setMetadataValue(metadata, key, value);
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function extractSkillMarkdownFrontmatter(content) {
  const match = String(content || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  return match ? match[1] : null;
}

export function parseSkillMarkdownMetadata(content) {
  const frontmatter = extractSkillMarkdownFrontmatter(content);
  if (!frontmatter) return null;
  return parseSkillDefinitionYaml(frontmatter);
}

function findDefinitionPath(paths, target) {
  if (paths.includes(target)) return target;
  return paths.find((path) => path.split('/').pop() === target) || null;
}

function parseDefinitionFile(path, content) {
  if (path.split('/').pop() === 'SKILL.md') {
    return parseSkillMarkdownMetadata(content);
  }
  return parseSkillDefinitionYaml(content);
}

function parseZipSkillMetadata(content) {
  const files = unzipSync(new Uint8Array(content));
  const paths = Object.keys(files).filter((path) => !path.endsWith('/'));
  const definitionPath = findDefinitionPath(paths, 'skill.yaml') || findDefinitionPath(paths, 'SKILL.md');
  if (!definitionPath) return null;
  return parseDefinitionFile(definitionPath, strFromU8(files[definitionPath]));
}

export async function readSkillPackageMetadata(file) {
  if (!file) return null;

  const lowerName = String(file.name || '').toLowerCase();
  if (lowerName.endsWith('.md')) {
    return parseSkillMarkdownMetadata(await file.text());
  }

  if (lowerName.endsWith('.zip')) {
    return parseZipSkillMetadata(await file.arrayBuffer());
  }

  return null;
}

export function formatSkillUploadError(detail) {
  const text = String(detail || '');

  const nameMismatch = text.match(/^skill name '(.+)' does not match slug '(.+)'$/);
  if (nameMismatch) {
    const [, skillName, slug] = nameMismatch;
    return `上传文件中的 SKILL.md/skill.yaml 声明 name 为 "${skillName}"，但当前 Slug 是 "${slug}"。请将 Slug 改为 "${skillName}"，或上传与当前 Slug 匹配的 Skill 文件。`;
  }

  const versionMismatch = text.match(/^skill version '(.+)' does not match expected '(.+)'$/);
  if (versionMismatch) {
    const [, fileVersion, expectedVersion] = versionMismatch;
    return `上传文件声明的版本是 "${fileVersion}"，但当前版本号是 "${expectedVersion}"。请修改版本号，或调整 SKILL.md/skill.yaml 中的 version。`;
  }

  if (text.includes('SKILL.md must start with YAML frontmatter')) {
    return '单文件 Markdown 必须是标准 SKILL.md，并以 YAML frontmatter 开头，例如 --- 后写入 name/description。';
  }

  if (text === 'Version already exists') {
    return '版本号已存在，请修改版本号后重新上传。';
  }

  if (text.includes('File too large') || text.includes('Request body exceeded') || text.includes('body exceeded')) {
    return '上传文件过大，服务端未能完整接收。请删除无关示例、图片或构建产物后重新打包上传。';
  }

  return text || '发布失败';
}

function extractErrorDetail(error) {
  const data = error?.response?.data;
  if (data && typeof data === 'object' && 'detail' in data) return data.detail;
  if (typeof data === 'string') return data;
  if (error?.message) return error.message;
  return '';
}

export function formatSkillPublishError(error) {
  const status = error?.response?.status;
  const detail = extractErrorDetail(error);
  const formatted = formatSkillUploadError(detail);
  const text = String(detail || '');

  if (
    status === 413 ||
    text.includes('Request body exceeded') ||
    text.includes('body exceeded') ||
    text.includes('too large')
  ) {
    return '上传失败：文件大小超过服务端限制。请删除无关示例、图片、缓存或构建产物后重新打包上传。';
  }

  if (
    text.includes('socket hang up') ||
    text.includes('ECONNRESET') ||
    text.includes('Network Error')
  ) {
    return '上传失败：上传连接被中断，常见原因是文件大小超过代理限制、服务刚重启或网络中断。请稍后重试；如果仍失败，请缩小压缩包后再上传。';
  }

  if (formatted && formatted !== '发布失败') {
    return `上传失败：${formatted}`;
  }

  if (status === 500) {
    return '上传失败：服务器处理文件时出错，可能是文件保存失败或上传包格式异常。请稍后重试，或联系管理员查看服务日志。';
  }

  if (status) {
    return `上传失败：服务器返回 ${status}，请检查文件内容、版本号和 Slug 后重试。`;
  }

  return '上传失败：未收到服务器响应，请检查网络连接或稍后重试。';
}
