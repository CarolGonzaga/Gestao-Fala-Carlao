import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

it('boots the compiled Vercel entry in native Node ESM and handles an API request', async () => {
  const workspace = resolve(process.cwd());
  const directory = await mkdtemp(join(workspace, '.runtime-test-'));
  try {
    // Match deployment: Node executes emitted JS, without Vite, tsx or Vitest's resolver.
    for (const file of [
      'api/index.ts',
      'server/app.ts',
      'server/db.ts',
      'server/export.ts',
      'shared/filters.ts',
    ]) {
      const source = await readFile(join(workspace, file), 'utf8');
      const target = join(directory, file.replace(/\.ts$/, '.js'));
      await mkdir(dirname(target), { recursive: true });
      const output = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          esModuleInterop: true,
        },
      });
      await writeFile(target, output.outputText);
    }
    const entry = pathToFileURL(join(directory, 'api/index.js')).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { once } from 'node:events';
      const { default: app } = await import(${JSON.stringify(entry)});
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/config', { headers: { Connection: 'close' } });
        console.log(JSON.stringify({ status: response.status, body: await response.json() }));
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      // This short-lived subprocess only verifies bootstrap and one request.
      process.exit(0);
    `,
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, DOTENV_CONFIG_PATH: join(directory, 'nonexistent.env') },
      },
    );
    expect(result.status, result.stderr || result.stdout || result.error?.message).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      status: 401,
      body: { error: 'Faça login para continuar.' },
    });
  } finally {
    if (
      dirname(resolve(directory)) !== workspace ||
      !directory.startsWith(join(workspace, '.runtime-test-'))
    ) {
      throw new Error('Unexpected test directory: cleanup refused');
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
