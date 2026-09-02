import { useState, useRef, useEffect } from 'react';
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

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [status?.logs]);

  const handleStartMigration = async () => {
    if (selectedTables.length === 0) return;
    setStarting(true);
    setErrorMessage(null);
    try {
      await api.startMigration(selectedTables, activeProfileId, creds.snowflake_user ? creds : null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to trigger migration pipeline');
    } finally {
      setStarting(false);
    }
  };

  const filteredTables = tables.filter((t) =>
    t.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const isRunning = status?.status === 'RUNNING';
  const isCompleted = status?.status === 'COMPLETED';
  const isFailed = status?.status?.startsWith('FAILED');

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230]">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
              STEP 2 OF 3
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Migration Pipeline Execution</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Parallel extract from Snowflake, stage directly to Unity Catalog Volume, and execute automated Delta COPY INTO.
          </p>
        </div>

        {isCompleted && (
          <button
            onClick={() => navigate('/validate')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-500/20 transition-all flex items-center space-x-2"
          >
            <span>Run Reconciliation Validation</span>
            <span>➔</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 font-mono">
          ✕ {errorMessage}
        </div>
      )}

      {/* Execution Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Table Selection & Action */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Target Tables for Migration ({selectedTables.length}/{tables.length})
              </h3>
              <div className="flex items-center space-x-2 text-[11px]">
                <button
                  onClick={selectAllTables}
                  disabled={isRunning}
                  className="text-blue-400 hover:underline font-medium disabled:opacity-50"
                >
                  All
                </button>
                <span className="text-slate-600">•</span>
                <button
                  onClick={clearSelectedTables}
                  disabled={isRunning}
                  className="text-slate-400 hover:underline font-medium disabled:opacity-50"
                >
                  None
                </button>
              </div>
            </div>

            {/* Filter */}
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search tables..."
              disabled={isRunning}
              className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
            />

            {/* Checkbox List */}
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {loadingTables ? (
                <div className="py-6 text-center text-xs text-slate-500">Loading tables...</div>
              ) : filteredTables.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">No tables discovered</div>
              ) : (
                filteredTables.map((tbl) => {
                  const isSelected = selectedTables.includes(tbl);
                  return (
                    <label
                      key={tbl}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-blue-600/10 border-blue-500/40 text-white'
                          : 'bg-[#0c0e14]/40 border-[#1e2230] text-slate-400 hover:bg-[#1f2333]/30'
                      } ${isRunning ? 'pointer-events-none opacity-80' : ''}`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTable(tbl)}
                          disabled={isRunning}
                          className="rounded border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                        />
                        <span className="font-mono text-xs">{tbl}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">SNOWFLAKE</span>
                    </label>
                  );
                })
              )}
            </div>

            {/* Pipeline Configuration Badge */}
            <div className="p-3 bg-[#0c0e14] border border-[#1e2230] rounded-lg space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Source Profile:</span>
                <span className="text-sky-400 font-bold truncate max-w-[180px]">
                  {activeProfile?.name || 'Snowflake'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Database / Schema:</span>
                <span className="text-slate-200">
                  {activeProfile?.snowflake_database}.{activeProfile?.snowflake_schema}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Workers:</span>
                <span className="text-slate-200">4 Parallel Threads</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Target:</span>
                <span className="text-slate-200">Unity Catalog Delta</span>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartMigration}
              disabled={selectedTables.length === 0 || isRunning || starting}
              className={`w-full py-3 rounded-lg font-semibold text-xs transition-all flex items-center justify-center space-x-2 ${
                selectedTables.length === 0 || isRunning || starting
                  ? 'bg-[#1f2333] text-slate-500 border border-[#252a3a] cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25'
              }`}
            >
              {isRunning ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Pipeline Active ({status?.progress}%)</span>
                </>
              ) : starting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Launching Pipeline...</span>
                </>
              ) : (
                <>
                  <span>▶ Start Pipeline Execution</span>
                  <span className="bg-blue-700/60 px-2 py-0.5 rounded text-[10px]">
                    {selectedTables.length} Tables
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Live Pipeline Monitor & Progress */}
        <div className="lg:col-span-7 space-y-4">
          {/* Progress Overview Card */}
          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                  PIPELINE STATUS
                </span>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-base font-bold text-white font-mono">
                    {status?.stage || 'IDLE'}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                    isRunning
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                      : isCompleted
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : isFailed
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    {status?.status || 'IDLE'}
                  </span>
                </div>
              </div>

              <div className="text-right font-mono text-xs">
                <span className="text-slate-500 block text-[10px]">DURATION</span>
                <span className="text-slate-200 font-bold">{status?.duration_seconds || 0}s</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Progress</span>
                <span>{status?.progress || 0}%</span>
              </div>
              <div className="w-full bg-[#0c0e14] rounded-full h-2 overflow-hidden border border-[#1e2230]">
                <div
                  className="bg-gradient-to-r from-blue-600 to-sky-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${status?.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Per-Table Live Progress Breakdown */}
            {status?.table_progress && Object.keys(status.table_progress).length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#1e2230]">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Table Execution Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                  {Object.entries(status.table_progress).map(([tName, tProg]) => (
                    <div
                      key={tName}
                      className="p-2.5 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-200 block truncate">{tName}</span>
                        <span className="text-[10px] text-slate-500">
                          {tProg.rows > 0 ? `${tProg.rows.toLocaleString()} rows` : tProg.stage}
                        </span>
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${
                        tProg.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : tProg.status === 'IN_PROGRESS'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}>
                        {tProg.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live Streaming Log Terminal */}
          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Pipeline Execution Logs
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {status?.logs?.length || 0} entries
              </span>
            </div>

            <div
              ref={logContainerRef}
              className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-3 max-h-[220px] overflow-y-auto font-mono text-[11px] space-y-1"
            >
              {!status?.logs || status.logs.length === 0 ? (
                <div className="text-slate-600 text-center py-6">Logs will stream here during execution...</div>
              ) : (
                status.logs.map((log, idx) => (
                  <div key={idx} className="flex space-x-2">
                    <span className="text-slate-600 shrink-0">[{log.time}]</span>
                    <span className={`shrink-0 font-bold ${
                      log.level === 'ERROR' ? 'text-rose-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-sky-400'
                    }`}>
                      [{log.level}]
                    </span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
