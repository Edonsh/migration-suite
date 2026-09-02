import { useState, useRef, useEffect } from 'react';
import { useMigration } from '@/contexts/MigrationContext';
import { useNavigate } from 'react-router-dom';

export function ConnectionSwitcher() {
  const navigate = useNavigate();
  const { profiles, activeProfileId, activeProfile, selectProfile } = useMigration();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayName = activeProfile?.name || 'Default Connection';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-[#12151f] hover:bg-[#1a1e2b] border border-[#252a3a] text-xs transition-all"
        title="Switch Snowflake Connection Profile"
      >
        <span className="text-sky-400 font-bold">❄</span>
        <div className="flex flex-col text-left">
          <span className="font-mono text-slate-200 text-[11px] font-semibold max-w-[150px] truncate leading-tight">
            {displayName}
          </span>
          <span className="text-[9px] text-slate-500 font-mono leading-tight">
            {activeProfile?.snowflake_database || 'MIGRATION_DB'}.{activeProfile?.snowflake_schema || 'SOURCE_DATA'}
          </span>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5 L5 6.5 L8 3.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#12151f] border border-[#252a3a] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Snowflake Connection Profiles
          </div>

          <div className="space-y-1 my-1 max-h-48 overflow-y-auto">
            {profiles.map((p) => {
              const isSelected = p.id === activeProfileId;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    selectProfile(p.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                      : 'hover:bg-[#1f2333] text-slate-300'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-bold block truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-500 block truncate">
                      {p.snowflake_database}.{p.snowflake_schema}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-blue-400 text-xs font-bold">✓</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#1e2230]">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/connections');
              }}
              className="w-full text-center py-1.5 text-[11px] font-medium text-blue-400 hover:bg-blue-500/10 rounded transition-all"
            >
              + Manage Connection Profiles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
