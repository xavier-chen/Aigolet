import type { MemoryRecord } from '@aigolet-next/protocol';
import { ORG_RANK } from '@aigolet-next/protocol';

/** Founder / desktop user always has top visibility */
export const FOUNDER_VIEWER_RANK = ORG_RANK.FOUNDER;

/** Whether a viewer rank can access content tagged with visibilityLevel */
export function canAccessVisibility(viewerRank: number, visibilityLevel: number): boolean {
  return viewerRank >= visibilityLevel;
}

/** Session visibility from participant agent ranks (max rank wins) */
export function computeSessionVisibility(participantRanks: number[]): number {
  if (participantRanks.length === 0) return ORG_RANK.STAFF;
  return Math.max(...participantRanks);
}

/** Filter memory records by viewer rank using metadata.visibilityLevel */
export function filterMemoriesByRank(
  records: MemoryRecord[],
  viewerRank: number,
): MemoryRecord[] {
  return records.filter((record) => {
    const level = record.metadata?.visibilityLevel;
    if (typeof level !== 'number') return true;
    return canAccessVisibility(viewerRank, level);
  });
}
