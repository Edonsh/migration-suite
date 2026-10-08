import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/contexts/MigrationContext';
import { api } from '@/lib/api';

export default function MigratePage() {
  const navigate = useNavigate();
  const {
    tables,
    selectedTables,
    toggleTable,
    selectAllTables,
    clearSelectedTables,
    loadingTables,
    activeProfileId,
    activeProfile,
    creds,
    status,
  } = useMigration();
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const filteredTables = tables.filter((table) => table.toLowerCase().includes(tableSearch.toLowerCase()));
  const isRunning = status?.status === 'RUNNING';
  const isCompleted = status?.status === 'COMPLETED';
  const isFailed = status?.status?.startsWith('FAILED');

  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [status?.logs]);

  const handleStartMigration = async () => {
    if (selectedTables.length === 0) return;
    setStarting(true);
    setErrorMessage(null);
    try {
      const explicitCreds = activeProfileId ? null : (creds.snowflake_user ? creds : null);
      await api.startMigration(selectedTables, activeProfileId, explicitCreds);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start data migration.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-[#1e2230] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-sky-400">Data migration</span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-100">Snowflake → Databricks</h1>
          <p className="mt-1 text-sm text-slate-400">Extract selected Snowflake tables to Parquet, stage them in Unity Catalog, and load them into Delta.</p>
        </div>
        {isCompleted && (
          <button onClick={() => navigate('/validate')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500">
            Validate migrated data →
          </button>
        )}
      </header>

      <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs leading-relaxed text-sky-200">
        Target Delta tables must already exist. Create them from the Lakebridge-transpiled DDL in <button className="font-bold underline" onClick={() => navigate('/analyze')}>Analyze & transpile</button> before loading data.
      </div>

      {errorMessage && <div className="whitespace-pre-wrap rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{errorMessage}</div>}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
        <section className="space-y-4 rounded-xl border border-[#252a3a] bg-[#12151f] p-5 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Tables ({selectedTables.length}/{tables.length})</h2>
            <div className="flex items-center gap-2 text-[11px]">
              <button onClick={selectAllTables} disabled={isRunning} className="text-sky-400 hover:underline disabled:opacity-50">All</button>
              <span className="text-slate-600">·</span>
              <button onClick={clearSelectedTables} disabled={isRunning} className="text-slate-400 hover:underline disabled:opacity-50">None</button>
            </div>
          </div>
          <input
            value={tableSearch}
            onChange={(event) => setTableSearch(event.target.value)}
            placeholder="Search tables…"
            disabled={isRunning}
            className="w-full rounded-lg border border-[#252a3a] bg-[#0c0e14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500"
          />
          <div className="max-h-[360px] space-y-1 overflow-y-auto rounded-lg border border-[#1e2230] p-2">
            {loadingTables ? <p className="p-5 text-center text-xs text-slate-500">Discovering Snowflake tables…</p> : filteredTables.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">No tables found.</p> : filteredTables.map((table) => (
              <label key={table} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-xs ${selectedTables.includes(table) ? 'border-sky-500/30 bg-sky-500/5 text-slate-100' : 'border-transparent text-slate-400 hover:bg-white/5'} ${isRunning ? 'pointer-events-none opacity-60' : ''}`}>
                <span className="flex items-center gap-2.5"><input type="checkbox" checked={selectedTables.includes(table)} onChange={() => toggleTable(table)} disabled={isRunning} /><span className="font-mono">{table}</span></span>
                <span className="text-[10px] font-mono text-slate-500">SNOWFLAKE</span>
              </label>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border border-[#1e2230] bg-[#0c0e14] p-3 text-xs">
            <div className="flex justify-between gap-3 text-slate-400"><span>Source profile</span><span className="truncate font-semibold text-sky-300">{activeProfile?.name || 'Snowflake'}</span></div>
            <div className="flex justify-between gap-3 text-slate-400"><span>Database / schema</span><span className="font-mono text-slate-200">{activeProfile?.snowflake_database || creds.snowflake_database}.{activeProfile?.snowflake_schema || creds.snowflake_schema}</span></div>
            <div className="flex justify-between gap-3 text-slate-400"><span>Target</span><span className="text-slate-200">Unity Catalog Delta</span></div>
            <div className="flex justify-between gap-3 text-slate-400"><span>Transfer</span><span className="text-slate-200">Parquet → COPY INTO</span></div>
          </div>
          <button
            onClick={handleStartMigration}
            disabled={selectedTables.length === 0 || isRunning || starting || loadingTables}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-[#1f2333] disabled:text-slate-500"
          >
            {isRunning ? `Migration running (${status?.progress || 0}%)` : starting ? 'Starting migration…' : `Start data migration · ${selectedTables.length} table${selectedTables.length === 1 ? '' : 's'}`}
          </button>
        </section>

        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-[#252a3a] bg-[#12151f] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Pipeline status</p><div className="mt-1 flex items-center gap-2"><h2 className="font-mono text-sm font-bold text-slate-100">{status?.stage || 'IDLE'}</h2><span className={`rounded border px-2 py-0.5 text-[10px] font-mono ${isRunning ? 'border-amber-500/30 text-amber-300' : isCompleted ? 'border-emerald-500/30 text-emerald-300' : isFailed ? 'border-rose-500/30 text-rose-300' : 'border-slate-700 text-slate-400'}`}>{status?.status || 'IDLE'}</span></div></div>
              <div className="text-right"><p className="text-[10px] font-mono text-slate-500">DURATION</p><p className="font-mono text-sm font-bold text-slate-200">{status?.duration_seconds || 0}s</p></div>
            </div>
            <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-slate-400"><span>Progress</span><span>{status?.progress || 0}% · {status?.tables_completed || 0}/{status?.tables_total || 0} tables</span></div><div className="h-2 overflow-hidden rounded-full border border-[#1e2230] bg-[#0c0e14]"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all" style={{ width: `${status?.progress || 0}%` }} /></div></div>
            {status?.table_progress && Object.keys(status.table_progress).length > 0 && <div className="space-y-2 border-t border-[#1e2230] pt-3"><h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Table progress</h3><div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">{Object.entries(status.table_progress).map(([name, progress]) => <div key={name} className="flex items-center justify-between gap-2 rounded-lg border border-[#1e2230] bg-[#0c0e14] p-2.5 text-xs"><div className="min-w-0"><span className="block truncate font-mono font-semibold text-slate-200">{name}</span><span className="text-[10px] text-slate-500">{progress.rows > 0 ? `${progress.rows.toLocaleString()} rows` : progress.stage}</span></div><span className={`text-[10px] ${progress.status === 'COMPLETED' ? 'text-emerald-300' : progress.status === 'FAILED' ? 'text-rose-300' : progress.status === 'IN_PROGRESS' ? 'text-sky-300' : 'text-slate-500'}`}>{progress.status}</span></div>)}</div></div>}
          </section>

          <section className="space-y-3 rounded-xl border border-[#252a3a] bg-[#12151f] p-4 shadow-xl">
            <div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Execution logs</h2><span className="text-[10px] text-slate-500">{status?.logs?.length || 0} entries</span></div>
            <div ref={logContainerRef} className="max-h-72 min-h-28 space-y-1 overflow-y-auto rounded-lg border border-[#1e2230] bg-[#0c0e14] p-3 font-mono text-[11px]">
              {!status?.logs?.length ? <p className="py-6 text-center text-slate-600">Logs appear here when a data migration starts.</p> : status.logs.map((log, index) => <div key={`${log.time}-${index}`} className="flex gap-2"><span className="shrink-0 text-slate-600">[{log.time}]</span><span className={`shrink-0 font-bold ${log.level === 'ERROR' ? 'text-rose-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-sky-400'}`}>[{log.level}]</span><span className="break-all text-slate-300">{log.message}</span></div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
