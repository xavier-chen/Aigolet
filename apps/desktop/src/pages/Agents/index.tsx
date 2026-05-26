import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Plus, Trash2, Pencil, Users } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ColleagueAvatar } from '@/components/colleague/ColleagueAvatar';
import { OrgChart } from '@/components/org/OrgChart';
import { staggerCards, fadeInUp } from '@/lib/gsap';
import {
  createAgent,
  createOrgNode,
  deleteAgent,
  deleteOrgNode,
  fetchAgents,
  fetchOrgTree,
  fetchSkillsList,
  fetchTools,
  updateAgent,
  type AgentRecord,
  type OrgTreeNode,
  type SkillRecord,
  type ToolDefinitionRecord,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface AgentFormState {
  name: string;
  description: string;
  systemPrompt: string;
  modelOverride: string;
  orgNodeId: string;
  allowedTools: string[];
  allowedSkills: string[];
}

const emptyForm: AgentFormState = {
  name: '',
  description: '',
  systemPrompt: '',
  modelOverride: '',
  orgNodeId: '',
  allowedTools: [],
  allowedSkills: [],
};

export function AgentsPage() {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([]);
  const [tools, setTools] = useState<ToolDefinitionRecord[]>([]);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeParentId, setNewNodeParentId] = useState<string | null>(null);
  const [showNodeForm, setShowNodeForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [agentList, tree, toolList, skillList] = await Promise.all([
      fetchAgents(),
      fetchOrgTree(),
      fetchTools(),
      fetchSkillsList(),
    ]);
    setAgents(agentList);
    setOrgTree(tree);
    setTools(toolList);
    setSkills(skillList);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (gridRef.current && !loading) staggerCards(gridRef.current.children, { delay: 0.1 });
  }, [loading]);

  const flatNodes = (nodes: OrgTreeNode[]): OrgTreeNode[] =>
    nodes.flatMap((n) => [n, ...flatNodes(n.children as OrgTreeNode[])]);

  const nodeName = (id?: string) =>
    id ? flatNodes(orgTree).find((n) => n.id === id)?.name : undefined;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (agent: AgentRecord) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      description: agent.description ?? '',
      systemPrompt: agent.systemPrompt ?? '',
      modelOverride: agent.modelOverride ?? '',
      orgNodeId: agent.orgNodeId ?? '',
      allowedTools: agent.allowedTools ?? [],
      allowedSkills: agent.allowedSkills ?? [],
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        systemPrompt: form.systemPrompt.trim() || undefined,
        modelOverride: form.modelOverride.trim() || undefined,
        orgNodeId: form.orgNodeId || undefined,
        allowedTools: form.allowedTools.length ? form.allowedTools : undefined,
        allowedSkills: form.allowedSkills.length ? form.allowedSkills : undefined,
      };
      if (editingId) {
        const updated = await updateAgent(editingId, payload);
        if (updated) {
          setAgents((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
          setShowForm(false);
          await load();
        }
      } else {
        const agent = await createAgent({ ...payload, enabled: true });
        if (agent) {
          setShowForm(false);
          setForm(emptyForm);
          await load();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (agent: AgentRecord) => {
    if (agent.id === 'default-agent') return;
    const updated = await updateAgent(agent.id, { enabled: !agent.enabled });
    if (updated) setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
  };

  const handleDelete = async (agent: AgentRecord) => {
    if (agent.id === 'default-agent') return;
    const ok = await deleteAgent(agent.id);
    if (ok) {
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      await load();
    }
  };

  const handleAddChild = (parentId: string) => {
    setNewNodeParentId(parentId);
    setNewNodeName('');
    setShowNodeForm(true);
  };

  const handleCreateNode = async () => {
    if (!newNodeName.trim()) return;
    const parent = newNodeParentId
      ? flatNodes(orgTree).find((n) => n.id === newNodeParentId)
      : undefined;
    const node = await createOrgNode({
      name: newNodeName.trim(),
      parentId: newNodeParentId ?? undefined,
      rank: parent ? Math.max(10, parent.rank - 10) : 50,
    });
    if (node) {
      setShowNodeForm(false);
      setNewNodeName('');
      await load();
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    const ok = await deleteOrgNode(nodeId);
    if (ok) await load();
  };

  const handleAssignAgent = async (nodeId: string, agentId: string) => {
    const updated = await updateAgent(agentId, { orgNodeId: nodeId });
    if (updated) await load();
  };

  const toggleMulti = (key: 'allowedTools' | 'allowedSkills', value: string) => {
    setForm((f) => {
      const list = f[key];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div ref={headerRef} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-300 mb-1">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">{t('agents.teamRoster')}</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">{t('agents.title')}</h1>
          <p className="text-[var(--text-muted)] mt-1">{t('agents.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {t('agents.add')}
        </Button>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
              <GitBranch className="w-5 h-5" />
              <CardTitle>{t('agents.orgChart')}</CardTitle>
            </div>
            <CardDescription>{t('agents.orgChartSubtitle')}</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNewNodeParentId(null);
              setShowNodeForm(true);
            }}
          >
            <Plus className="w-4 h-4" />
            {t('agents.addNode')}
          </Button>
        </div>

        {showNodeForm && (
          <div className="flex gap-2 flex-wrap items-end p-4 rounded-xl bg-brand-50/50 dark:bg-brand-900/10">
            <input
              className="flex-1 min-w-[200px] rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
              placeholder={t('agents.nodeNamePlaceholder')}
              value={newNodeName}
              onChange={(e) => setNewNodeName(e.target.value)}
            />
            <Button onClick={() => void handleCreateNode()} disabled={!newNodeName.trim()}>
              {t('common.save')}
            </Button>
            <Button variant="outline" onClick={() => setShowNodeForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        )}

        {!loading && (
          <OrgChart
            tree={orgTree}
            agents={agents}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onAddChild={handleAddChild}
            onDeleteNode={(id) => void handleDeleteNode(id)}
            onAssignAgent={(nodeId, agentId) => void handleAssignAgent(nodeId, agentId)}
          />
        )}
      </Card>

      {showForm && (
        <Card className="space-y-4 border-brand-200 dark:border-brand-800">
          <CardTitle>{editingId ? t('agents.editAgent') : t('agents.newAgent')}</CardTitle>
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
            placeholder={t('agents.namePlaceholder')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
            placeholder={t('agents.descriptionPlaceholder')}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <select
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
            value={form.orgNodeId}
            onChange={(e) => setForm((f) => ({ ...f, orgNodeId: e.target.value }))}
          >
            <option value="">{t('agents.noOrgPosition')}</option>
            {flatNodes(orgTree).map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({t('agents.rank')}: {n.rank})
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] min-h-[100px]"
            placeholder={t('agents.systemPromptPlaceholder')}
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
          />
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] font-mono"
            placeholder={t('agents.modelOverridePlaceholder')}
            value={form.modelOverride}
            onChange={(e) => setForm((f) => ({ ...f, modelOverride: e.target.value }))}
          />

          <div>
            <p className="text-sm font-medium mb-1">{t('agents.allowedTools')}</p>
            <p className="text-xs text-[var(--text-muted)] mb-2">{t('agents.allowedToolsHint')}</p>
            <div className="flex flex-wrap gap-2">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggleMulti('allowedTools', tool.id)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    form.allowedTools.includes(tool.id)
                      ? 'bg-brand-100 border-brand-300 text-brand-700 dark:bg-brand-900/40'
                      : 'border-[var(--border)] text-[var(--text-muted)]',
                  )}
                >
                  {tool.id}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">{t('agents.allowedSkills')}</p>
            <p className="text-xs text-[var(--text-muted)] mb-2">{t('agents.allowedSkillsHint')}</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleMulti('allowedSkills', skill.id)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    form.allowedSkills.includes(skill.id)
                      ? 'bg-brand-100 border-brand-300 text-brand-700 dark:bg-brand-900/40'
                      : 'border-[var(--border)] text-[var(--text-muted)]',
                  )}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void handleSubmit()} disabled={submitting || !form.name.trim()}>
              {editingId ? t('agents.save') : t('agents.create')}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="text-center py-12 text-[var(--text-muted)]">{t('agents.loading')}</Card>
      ) : (
        <div ref={gridRef} className="grid md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4 flex flex-col gap-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4">
                <ColleagueAvatar agentId={agent.id} name={agent.name} size="lg" online={agent.enabled} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    {agent.id === 'default-agent' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600">
                        {t('agents.default')}
                      </span>
                    )}
                    <span
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full',
                        agent.enabled
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
                      )}
                    >
                      {agent.enabled ? t('agents.enabled') : t('agents.disabled')}
                    </span>
                  </div>
                  <CardDescription className="mt-1 line-clamp-2">
                    {agent.description ?? t('agents.noDescription')}
                  </CardDescription>
                  {agent.orgNodeId && (
                    <p className="text-xs text-brand-600 dark:text-brand-300 mt-2">
                      {t('agents.orgPosition')}: {nodeName(agent.orgNodeId) ?? agent.orgNodeId}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <Button size="sm" variant="ghost" onClick={() => openEdit(agent)}>
                  <Pencil className="w-3.5 h-3.5" />
                  {t('common.edit')}
                </Button>
                {agent.id !== 'default-agent' && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => void toggleEnabled(agent)}>
                      {agent.enabled ? t('agents.disabled') : t('agents.enabled')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600 ml-auto"
                      onClick={() => void handleDelete(agent)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('agents.delete')}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
