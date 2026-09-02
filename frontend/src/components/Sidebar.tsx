import { NavLink } from 'react-router-dom';

// ─── Nav config ──────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  secondary?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  {
    label: 'Analyze',
    href: '/analyze',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12 L5 8 L7 10 L10 5 L14 9" />
        <circle cx="14" cy="9" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Migrate',
    href: '/migrate',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8 H13 M10 5 L13 8 L10 11" />
        <rect x="1" y="5.5" width="4" height="5" rx="1" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    label: 'Validate',
    href: '/validate',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2 L14 5 L14 9 C14 12 11 14 8 15 C5 14 2 12 2 9 L2 5 Z" />
        <path d="M5.5 8 L7.2 10 L10.5 6.5" />
      </svg>
    ),
  },
];

const SECONDARY_NAV: NavItem[] = [
  {
    label: 'Migrations',
    href: '/migrations',
    secondary: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="14" height="10" rx="1.5" />
        <path d="M1 6.5 H15" />
        <path d="M5 9.5 H7" />
        <path d="M9 9.5 H11" />
      </svg>
    ),
  },
  {
    label: 'Connections',
    href: '/connections',
    secondary: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="4" cy="8" r="2.2" />
        <circle cx="12" cy="8" r="2.2" />
        <path d="M6.2 8 H9.8" />
      </svg>
    ),
  },
];

// ─── Component ───────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Main navigation">

      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" aria-hidden="true">G</div>
        <span className="sidebar-logo-text">GElevate</span>
      </div>

      {/* Nav items */}
      <div className="sidebar-nav">
        {/* Primary group */}
        <div className="nav-section">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              id={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `nav-item${isActive ? ' active' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              {collapsed && <span className="nav-tooltip">{item.label}</span>}
            </NavLink>
          ))}
        </div>

        {/* Divider */}
        <div className="nav-divider" role="separator" />

        {/* Secondary group */}
        <div className="nav-section">
          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              id={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `nav-item secondary${isActive ? ' active' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              {collapsed && <span className="nav-tooltip">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Collapse toggle */}
      <div className="sidebar-collapse-btn">
        <button
          className="collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          id="sidebar-collapse-btn"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2 L4 7 L9 12" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
