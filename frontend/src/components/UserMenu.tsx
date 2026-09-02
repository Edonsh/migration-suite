import { useState, useRef, useEffect } from 'react';
import { useIdentity } from '@/contexts/IdentityContext';
import { getInitials } from '@/lib/identity';

export function UserMenu() {
  const { identity, loading } = useIdentity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = loading ? '…' : getInitials(identity);
  const displayName = identity.display_name || identity.email || 'Unknown user';
  const email = identity.email;

  return (
    <div className="dropdown-wrapper" ref={ref}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        id="user-menu-btn"
      >
        <div className="user-avatar" aria-hidden="true">{initials}</div>
        <div className="user-info">
          <span className="user-name">{loading ? 'Loading…' : displayName}</span>
          {email && <span className="user-email">{email}</span>}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : '' }}
          aria-hidden="true"
        >
          <path d="M2 4 L6 8 L10 4" />
        </svg>
      </button>

      {open && (
        <div className="dropdown-menu" role="menu">
          <div className="dropdown-header">
            <div className="dropdown-display-name">{displayName}</div>
            {email && <div className="dropdown-email">{email}</div>}
          </div>
          <button
            className="dropdown-item"
            role="menuitem"
            id="user-menu-signout"
            onClick={() => setOpen(false)}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 11H2.5A1.5 1.5 0 0 1 1 9.5v-6A1.5 1.5 0 0 1 2.5 2H5" />
              <path d="M8.5 9.5L12 6.5L8.5 3.5" />
              <line x1="12" y1="6.5" x2="5" y2="6.5" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
