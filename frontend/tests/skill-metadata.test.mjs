import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatSkillPublishError,
  formatSkillUploadError,
  parseSkillMarkdownMetadata,
  readSkillPackageMetadata,
} from '../src/utils/skillMetadata.mjs';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeString(buffer, value, offset) {
  buffer.write(value, offset, Buffer.byteLength(value));
}

function makeStoredZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [path, content] of entries) {
    const name = Buffer.from(path);
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    chunks.push(local, data);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);
    central.push(header);
    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

function makeFile(name, data) {
  return {
    name,
    async arrayBuffer() {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    },
    async text() {
      return data.toString('utf8');
    },
  };
}

test('parses SKILL.md frontmatter metadata used by publish upload', () => {
  const metadata = parseSkillMarkdownMetadata(`---
name: "pdf"
version: 1.2.3
description: "PDF helper"
---

# PDF Skill
`);

  assert.deepEqual(metadata, {
    name: 'pdf',
    version: '1.2.3',
    description: 'PDF helper',
  });
});

test('formats skill name and slug mismatch as actionable Chinese copy', () => {
  const message = formatSkillUploadError("skill name 'pdf' does not match slug 'test'");

  assert.match(message, /SKILL\.md/);
  assert.match(message, /pdf/);
  assert.match(message, /test/);
  assert.match(message, /Slug/);
});

test('formats upload proxy failures with a clear reason', () => {
  const message = formatSkillPublishError({
    response: {
      status: 500,
      data: 'Failed to proxy http://backend:8000/api/skills/by-slug/ppt-master/versions Error: socket hang up',
    },
  });

  assert.match(message, /上传连接被中断/);
  assert.match(message, /文件大小/);
});

test('formats backend validation errors from upload response detail', () => {
  const message = formatSkillPublishError({
    response: {
      status: 400,
      data: { detail: 'Version already exists' },
    },
  });

  assert.match(message, /版本号已存在/);
});

test('reads nested SKILL.md metadata from uploaded zip packages', async () => {
  const zip = makeStoredZip([
    ['ppt-master/SKILL.md', `---
name: ppt-master
description: >
  AI-driven multi-format SVG content generation system.
  Converts source documents into high-quality SVG pages.
---

# PPT Master
`],
  ]);

  const metadata = await readSkillPackageMetadata(makeFile('ppt-master.zip', zip));

  assert.deepEqual(metadata, {
    name: 'ppt-master',
    description: 'AI-driven multi-format SVG content generation system. Converts source documents into high-quality SVG pages.',
  });
});
