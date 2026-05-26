import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { HomePage } from '@/pages/Home';
import { ChatPage } from '@/pages/Chat';
import { TasksPage } from '@/pages/Tasks';
import { RunDetailPage } from '@/pages/Tasks/RunDetail';
import { AuditPage } from '@/pages/Audit';
import { SettingsPage } from '@/pages/Settings';
import { AgentsPage } from '@/pages/Agents';
import { SecretaryPage } from '@/pages/Secretary';
import { SkillsPage } from '@/pages/Skills';
import { GoalsPage } from '@/pages/Goals';
import { BrainPage } from '@/pages/Brain';
import { ArtifactsPage } from '@/pages/Artifacts';
import { FinancePage } from '@/pages/Finance';
import { TimelinePage } from '@/pages/Timeline';

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="brain" element={<BrainPage />} />
        <Route path="artifacts" element={<ArtifactsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:runId" element={<RunDetailPage />} />
        <Route path="memory" element={<Navigate to="/brain" replace />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="secretary" element={<SecretaryPage />} />
        <Route path="cron" element={<Navigate to="/secretary" replace />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
