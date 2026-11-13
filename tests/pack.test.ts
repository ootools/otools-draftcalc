import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function archiveFiles(data: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (data.readUInt32LE(offset) === 0x04034b50) {
    const method = data.readUInt16LE(offset + 8);
    const size = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const payload = data.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(payload) : payload);
    offset = start + size;
  }
  return files;
}

it('ships the license and notice texts in the plugin installation archive', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'otools-draftcalc-pack-'));
  const notices = [
    'THIRD_PARTY_NOTICES.md',
    'licenses/mathjs-LICENSE',
    'licenses/mathjs-NOTICE',
    'licenses/onnxruntime-web-LICENSE',
    'licenses/vue-LICENSE',
    'licenses/otools-plugin-sdk-LICENSE',
    'licenses/bhmsds-LICENSE',
    'licenses/vite-LICENSE.md',
    'licenses/vitest-LICENSE.md',
  ];
  try {
    mkdirSync(path.join(root, 'scripts'));
    mkdirSync(path.join(root, 'dist'));
    mkdirSync(path.join(root, 'licenses'));
    writeFileSync(path.join(root, 'scripts/pack-plugin.mjs'), readFileSync(path.join(repo, 'scripts/pack-plugin.mjs')));
    writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({
      uuid: 'otools-draftcalc', packid: 'otools-draftcalc', version: '0.1.0', entry: 'dist/index.html',
    }));
    writeFileSync(path.join(root, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(path.join(root, 'dist/index.html'), '<title>OTools</title>');
    for (const name of notices) writeFileSync(path.join(root, name), readFileSync(path.join(repo, name)));

    const packed = spawnSync(process.execPath, [path.join(root, 'scripts/pack-plugin.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    expect(packed.status, packed.stderr).toBe(0);
    const files = archiveFiles(readFileSync(path.join(root, 'dist-pack/otools-draftcalc-0.1.0.oplg')));
    for (const name of notices) {
      expect(files.has(name), `missing distribution notice: ${name}`).toBe(true);
      expect(files.get(name)?.equals(readFileSync(path.join(repo, name)))).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
