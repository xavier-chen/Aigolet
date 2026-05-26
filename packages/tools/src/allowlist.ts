import type { ToolDefinition, ToolHandler, ToolRegistry } from './index.js';

/** Wraps a registry to expose only allowlisted tools (empty allowlist = all allowed) */
export class AllowlistToolRegistry implements ToolRegistry {
  constructor(
    private readonly base: ToolRegistry,
    private readonly allowedToolIds: string[] | null | undefined,
  ) {}

  private isAllowed(toolId: string): boolean {
    if (!this.allowedToolIds || this.allowedToolIds.length === 0) return true;
    return this.allowedToolIds.includes(toolId);
  }

  register(_definition: ToolDefinition, _handler: ToolHandler): void {
    throw new Error('AllowlistToolRegistry is read-only');
  }

  get(id: string): { definition: ToolDefinition; handler: ToolHandler } | null {
    if (!this.isAllowed(id)) return null;
    return this.base.get(id);
  }

  list(): ToolDefinition[] {
    return this.base.list().filter((d) => this.isAllowed(d.id));
  }
}

/** Policy engine that enforces per-agent tool allowlists */
export class AgentAllowlistPolicyEngine {
  constructor(private readonly allowedToolIds: string[] | null | undefined) {}

  async evaluate(
    _actor: { type: string; id: string },
    toolId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.allowedToolIds || this.allowedToolIds.length === 0) {
      return { allowed: true };
    }
    if (this.allowedToolIds.includes(toolId)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Tool ${toolId} is not in agent allowlist` };
  }
}
