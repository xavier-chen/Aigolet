/**
 * Free port 3847 when a stale orchestrator is listening (health OK but /api/runs missing).
 * Prevents Chat 404s after code updates when an old server process was left running.
 */
import { execSync } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3847);
const BASE = `http://127.0.0.1:${PORT}`;

async function probe() {
  try {
    const healthRes = await fetch(`${BASE}/health`);
    if (!healthRes.ok) return 'incompatible';

    const runsRes = await fetch(`${BASE}/api/runs`);
    if (runsRes.ok) return 'compatible';

    return 'stale';
  } catch {
    return 'free';
  }
}

function killListenersOnPort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set(
        out
          .split('\n')
          .map((line) => line.trim().split(/\s+/).pop())
          .filter(Boolean),
      );
      for (const pid of pids) {
        execSync(`taskkill /PID ${pid} /F`);
      }
    } catch {
      // nothing listening
    }
    return;
  }

  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
    if (!pids) return;
    for (const pid of pids.split('\n')) {
      if (!pid) continue;
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

async function waitForPortFree(port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execSync(`lsof -ti :${port}`, { stdio: 'ignore' });
      await sleep(200);
    } catch {
      return;
    }
  }

  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
    if (!pids) return;
    for (const pid of pids.split('\n')) {
      if (!pid) continue;
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // already gone
      }
    }
  } catch {
    // nothing listening
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const state = await probe();

if (state === 'compatible') {
  console.log(`[ensure-port] Orchestrator on :${PORT} is ready`);
  process.exit(0);
}

if (state === 'stale') {
  console.warn(`[ensure-port] Stale orchestrator on :${PORT} (missing /api/runs) — stopping it`);
  killListenersOnPort(PORT);
  await waitForPortFree(PORT);
  process.exit(0);
}

if (state === 'free') {
  console.log(`[ensure-port] Port :${PORT} is free`);
  process.exit(0);
}

console.warn(`[ensure-port] Unexpected server on :${PORT} — stopping it`);
killListenersOnPort(PORT);
await waitForPortFree(PORT);
