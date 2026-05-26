import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import gsap from 'gsap';
import { ColleagueAvatar } from '@/components/colleague/ColleagueAvatar';
import { cn } from '@/lib/utils';
import type { AgentRecord, OrgTreeNode } from '@/lib/api-client';

interface OrgChartProps {
  tree: OrgTreeNode[];
  agents: AgentRecord[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onAssignAgent: (nodeId: string, agentId: string) => void;
}

function OrgTreeBranch({
  node,
  agents,
  selectedNodeId,
  onSelectNode,
  onAddChild,
  onDeleteNode,
  onAssignAgent,
  depth = 0,
}: {
  node: OrgTreeNode;
  agents: AgentRecord[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onAssignAgent: (nodeId: string, agentId: string) => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const nodeRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedNodeId === node.id;

  useEffect(() => {
    if (nodeRef.current) {
      gsap.fromTo(
        nodeRef.current,
        { opacity: 0, y: 12, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, delay: depth * 0.06, ease: 'back.out(1.4)' },
      );
    }
  }, [node.id, depth]);

  const unassigned = agents.filter(
    (a) => !a.orgNodeId || a.orgNodeId === node.id || a.orgNodeId === node.id,
  );

  return (
    <div className="flex flex-col items-center">
      <div
        ref={nodeRef}
        className={cn(
          'relative min-w-[180px] rounded-2xl border-2 px-4 py-3 transition-all duration-300 cursor-pointer',
          'bg-[var(--bg-card)] shadow-soft hover:shadow-lg hover:-translate-y-0.5',
          isSelected
            ? 'border-brand-400 ring-2 ring-brand-200 dark:ring-brand-800'
            : 'border-[var(--border)] hover:border-brand-300',
        )}
        style={{ borderTopColor: node.color ?? undefined, borderTopWidth: node.color ? 4 : undefined }}
        onClick={() => onSelectNode(node.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-sm text-[var(--text-primary)]">{node.name}</div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {t('agents.rank')}: {node.rank}
            </div>
          </div>
          <div className="flex gap-1">
            {node.children.length > 0 && (
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/30 text-brand-600"
              title={t('agents.addChildNode')}
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node.id);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {node.id !== 'org-founder' && (
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {node.agents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
            {node.agents.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 text-xs">
                <ColleagueAvatar agentId={a.id} name={a.name} size="sm" online={a.enabled} />
                <span className="truncate max-w-[80px]">{a.name}</span>
              </div>
            ))}
          </div>
        )}

        {isSelected && (
          <div className="mt-3 pt-2 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
            <label className="text-[10px] text-[var(--text-muted)]">{t('agents.assignColleague')}</label>
            <select
              className="mt-1 w-full text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onAssignAgent(node.id, e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">{t('agents.assignColleague')}</option>
              {unassigned.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {expanded && node.children.length > 0 && (
        <>
          <div className="w-0.5 h-6 bg-gradient-to-b from-brand-300 to-brand-200 dark:from-brand-700 dark:to-brand-900 org-line" />
          <div className="flex gap-6 items-start relative">
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-0.5 bg-brand-200 dark:bg-brand-800 org-connector"
                style={{ left: '10%', right: '10%' }}
              />
            )}
            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-0.5 h-4 bg-brand-200 dark:bg-brand-800" />
                <OrgTreeBranch
                  node={child}
                  agents={agents}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  onAddChild={onAddChild}
                  onDeleteNode={onDeleteNode}
                  onAssignAgent={onAssignAgent}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChart({
  tree,
  agents,
  selectedNodeId,
  onSelectNode,
  onAddChild,
  onDeleteNode,
  onAssignAgent,
}: OrgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current.querySelectorAll('.org-line, .org-connector'),
        { scaleY: 0, opacity: 0 },
        { scaleY: 1, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power2.out' },
      );
    }
  }, [tree]);

  if (tree.length === 0) return null;

  return (
    <div ref={containerRef} className="overflow-x-auto pb-6">
      <div className="flex justify-center gap-10 min-w-max px-4">
        {tree.map((node) => (
          <OrgTreeBranch
            key={node.id}
            node={node}
            agents={agents}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onAddChild={onAddChild}
            onDeleteNode={onDeleteNode}
            onAssignAgent={onAssignAgent}
          />
        ))}
      </div>
    </div>
  );
}
