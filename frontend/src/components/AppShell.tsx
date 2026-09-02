import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { IdentityProvider } from '@/contexts/IdentityContext';

const PAGE_TITLES: Record<string, string> = {
  '/analyze':     'Analyze',
  '/migrate':     'Migrate',
  '/validate':    'Validate',
  '/migrations':  'Migrations',
  '/connections': 'Connections',
};

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const title = PAGE_TITLES[location.pathname] ?? 'Migration Suite';

  return (
    <IdentityProvider>
      <div className="app-shell">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className="main-area">
          <TopBar title={title} />
          <main className="page-content" id="main-content">
            <Outlet />
          </main>
        </div>
      </div>
    </IdentityProvider>
  );
}
