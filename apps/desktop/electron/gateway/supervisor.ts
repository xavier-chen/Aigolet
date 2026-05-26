/**
 * Orchestrator server supervisor
 */
import { utilityProcess, app, type UtilityProcess } from 'electron';
import { execSync } from 'node:child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface ServerHealth {
  ok: boolean;
  status?: string;
  uptime?: number;
  error?: string;
}

const DEFAULT_PORT = 3847;
const HEALTH_POLL_MS = 250;
const HEALTH_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;

export class ServerSupervisor {
  private child: UtilityProcess | null = null;
  private status: ServerStatus = 'stopped';
  private port = DEFAULT_PORT;
  private lastError?: string;
  private spawnedBySelf = false;
  private adoptedExternalServer = false;
  private stopPromise: Promise<void> | null = null;

  getStatus(): { status: ServerStatus; port: number; error?: string } {
    return { status: this.status, port: this.port, error: this.lastError };
  }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return;

    const existing = await this.checkHealth();
    if (existing.ok) {
      this.status = 'running';
      this.spawnedBySelf = false;
      this.adoptedExternalServer = true;
      return;
    }

    this.status = 'starting';
    this.lastError = undefined;
    this.adoptedExternalServer = false;

    const serverEntry = this.resolveServerEntry();
    if (!serverEntry) {
      this.status = 'error';
      this.lastError =
        'Server entry not found. Run pnpm build in apps/server first, or use dev server.';
      console.warn('[supervisor]', this.lastError);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.child = utilityProcess.fork(serverEntry, [], {
          env: {
            ...process.env,
            PORT: String(this.port),
            NODE_ENV: process.env.NODE_ENV ?? 'development',
            AIGOLET_SPAWNED_BY_ELECTRON: '1',
          },
          stdio: 'pipe',
          serviceName: 'aigolet-orchestrator',
        });
        this.spawnedBySelf = true;

        this.child.stdout?.on('data', (data: Buffer) => {
          console.log('[orchestrator]', data.toString().trim());
        });

        this.child.stderr?.on('data', (data: Buffer) => {
          console.error('[orchestrator]', data.toString().trim());
        });

        this.child.on('spawn', () => {
          void this.waitForHealth()
            .then(() => {
              this.status = 'running';
              resolve();
            })
            .catch((err) => {
              this.status = 'error';
              this.lastError = err instanceof Error ? err.message : String(err);
              reject(err);
            });
        });

        this.child.on('exit', (code) => {
          this.status = 'stopped';
          this.child = null;
          this.spawnedBySelf = false;
          if (code !== 0 && code !== null) {
            this.lastError = `Process exited with code ${code}`;
          }
        });
      } catch (err) {
        this.status = 'error';
        this.lastError = err instanceof Error ? err.message : String(err);
        reject(err);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopInternal(false);
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  /** Stop owned child and, on app quit, also tear down adopted dev servers on :3847. */
  async shutdownOnQuit(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopInternal(true);
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async checkHealth(): Promise<ServerHealth> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/health`);
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { status: string; uptime: number };

      const runsRes = await fetch(`http://127.0.0.1:${this.port}/api/runs`);
      if (!runsRes.ok) {
        return {
          ok: false,
          error: 'Server missing /api/runs (stale orchestrator on port 3847?)',
        };
      }

      return { ok: true, status: data.status, uptime: data.uptime };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async stopInternal(shutdownOnQuit: boolean): Promise<void> {
    if (this.child && this.spawnedBySelf) {
      await this.stopOwnedChild();
      this.status = 'stopped';
      return;
    }

    if (shutdownOnQuit && this.adoptedExternalServer) {
      const health = await this.checkHealth();
      if (health.ok) {
        console.log('[supervisor] Stopping adopted orchestrator on quit');
        this.killListenersOnPort(this.port);
        await this.waitForPortFree(this.port);
      }
    }

    this.status = 'stopped';
    this.adoptedExternalServer = false;
  }

  private async stopOwnedChild(): Promise<void> {
    const child = this.child;
    if (!child) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[supervisor] Owned orchestrator did not exit in time; forcing kill');
        try {
          child.kill();
        } catch {
          // already gone
        }
        this.killListenersOnPort(this.port);
        resolve();
      }, STOP_TIMEOUT_MS);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        child.kill();
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.child = null;
    this.spawnedBySelf = false;
    await this.waitForPortFree(this.port);
  }

  private killListenersOnPort(port: number): void {
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

  private async waitForPortFree(port: number, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (process.platform === 'win32') {
          execSync(`netstat -ano | findstr :${port}`, { stdio: 'ignore' });
        } else {
          execSync(`lsof -ti :${port}`, { stdio: 'ignore' });
        }
        await new Promise((r) => setTimeout(r, 200));
      } catch {
        return;
      }
    }

    this.killListenersOnPort(port);
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const health = await this.checkHealth();
      if (health.ok) return;
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
    }
    throw new Error(`Server health check timed out after ${HEALTH_TIMEOUT_MS}ms`);
  }

  private resolveServerEntry(): string | null {
    const candidates = [
      join(process.cwd(), '../../server/dist/index.js'),
      join(__dirname, '../../../../server/dist/index.js'),
      join(app.getAppPath(), 'server/dist/index.js'),
    ];

    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return null;
  }
}
