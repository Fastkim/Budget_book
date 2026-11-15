import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');

// Only this checkout's generated directory can be replaced.
const target = relative(root, output);
if (target !== 'dist' || isAbsolute(target)) throw new Error('잘못된 빌드 경로입니다.');

await readFile(join(root, 'index.html'));
await stat(join(root, 'src'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'index.html'), join(output, 'index.html'));
await cp(join(root, 'src'), join(output, 'src'), { recursive: true });
try {
  await stat(join(root, 'public'));
  await cp(join(root, 'public'), join(output, 'public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await writeFile(join(output, '.nojekyll'), '');

async function countFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(entries.map(entry => entry.isDirectory() ? countFiles(join(directory, entry.name)) : 1));
  return counts.reduce((sum, count) => sum + count, 0);
}

console.log(`빌드 완료: dist/ (${await countFiles(output)}개 파일)`);
