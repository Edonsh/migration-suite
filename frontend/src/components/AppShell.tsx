import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { IdentityProvider } from '@/contexts/IdentityContext';
import { MigrationProvider } from '@/contexts/MigrationContext';

const PAGE_TITLES: Record<string, string> = {
  '/analyze':     'Analyze & Introspect',
  '/migrate':     'Pipeline Execution',
  '/validate':    'Post-Migration Validation',
  '/migrations':  'Migration Job History',
  '/connections': 'Connection Management',
};

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const title = PAGE_TITLES[location.pathname] ?? 'Migration Suite';

  return (
    <IdentityProvider>
      <MigrationProvider>
        <div className="app-shell">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <div className="main-area">
            <TopBar title={title} />
            <main className="page-content" id="main-content">
              <Outlet />
            </main>
          </div>
        </div>
      </MigrationProvider>
    </IdentityProvider>
  );
}
