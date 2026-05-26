import { spawn } from 'node:child_process';
import electronPath from 'electron';

delete process.env.ELECTRON_RUN_AS_NODE;

const child = spawn(String(electronPath), ['.'], {
  stdio: 'inherit',
  env: { ...process.env },
  cwd: process.cwd(),
});

child.on('exit', (code) => process.exit(code ?? 0));
