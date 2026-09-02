import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import AnalyzePage from '@/pages/AnalyzePage';
import MigratePage from '@/pages/MigratePage';
import ValidatePage from '@/pages/ValidatePage';
import MigrationsPage from '@/pages/MigrationsPage';
import ConnectionsPage from '@/pages/ConnectionsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/analyze" replace />} />
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/migrate" element={<MigratePage />} />
          <Route path="/validate" element={<ValidatePage />} />
          <Route path="/migrations" element={<MigrationsPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="*" element={<Navigate to="/analyze" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
