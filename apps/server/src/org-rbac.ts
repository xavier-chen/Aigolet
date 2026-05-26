import type { SqliteAgentStore, SqliteOrgNodeStore, SqliteSessionRepository } from '@aigolet-next/persistence';
import {
  canAccessVisibility,
  computeSessionVisibility,
  FOUNDER_VIEWER_RANK,
  getAgentRank,
} from '@aigolet-next/persistence';

export function resolveViewerRank(
  agentStore: SqliteAgentStore,
  orgNodeStore: SqliteOrgNodeStore,
  viewerAgentId: string,
  founderView?: boolean,
): number {
  if (founderView) return FOUNDER_VIEWER_RANK;
  return getAgentRank(agentStore, orgNodeStore, viewerAgentId);
}

export async function syncSessionVisibility(
  sessionRepo: SqliteSessionRepository,
  agentStore: SqliteAgentStore,
  orgNodeStore: SqliteOrgNodeStore,
  sessionId: string,
  agentId: string,
): Promise<number> {
  const rank = getAgentRank(agentStore, orgNodeStore, agentId);
  const session = await sessionRepo.get(sessionId);
  if (!session) return rank;
  const level = computeSessionVisibility([session.visibilityLevel ?? 10, rank]);
  if (level !== (session.visibilityLevel ?? 10)) {
    await sessionRepo.updateVisibility(sessionId, level);
  }
  return level;
}

export function canViewSession(
  agentStore: SqliteAgentStore,
  orgNodeStore: SqliteOrgNodeStore,
  session: { visibilityLevel?: number; agentId: string },
  viewerAgentId: string,
  founderView?: boolean,
): boolean {
  const viewerRank = resolveViewerRank(agentStore, orgNodeStore, viewerAgentId, founderView);
  const visibility =
    session.visibilityLevel ?? getAgentRank(agentStore, orgNodeStore, session.agentId);
  return canAccessVisibility(viewerRank, visibility);
}

export { canAccessVisibility, FOUNDER_VIEWER_RANK, getAgentRank };
