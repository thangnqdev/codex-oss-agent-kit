import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require.resolve('typescript');
} catch {
  process.exit(0);
}

const result = spawnSync('npx', ['tsc'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
