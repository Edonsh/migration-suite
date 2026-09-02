import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/contexts/MigrationContext';
import { type MigrationStatusResponse } from '@/lib/api';

export default function MigrationsPage() {
  const navigate = useNavigate();
  const { history, fetchHistory, setSelectedTables } = useMigration();
  const [loading, setLoading] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchHistory();
    setLoading(false);
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  const handleRerun = (run: MigrationStatusResponse) => {
    if (run.selected_tables && run.selected_tables.length > 0) {
      setSelectedTables(run.selected_tables);
      navigate('/migrate');
    }
  };

  const handleValidate = (run: MigrationStatusResponse) => {
    if (run.selected_tables && run.selected_tables.length > 0) {
      setSelectedTables(run.selected_tables);
      navigate('/validate');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Migration Job History</h2>
          <p className="text-xs text-slate-400 mt-1">
            Audit trail of migration runs, execution durations, table outcomes, and job logs.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-3 py-1.5 bg-[#12151f] hover:bg-[#1f2333] border border-[#252a3a] rounded-lg text-xs font-medium text-slate-300 transition-all flex items-center space-x-1.5"
        >
          <span>↻</span>
          <span>{loading ? 'Refreshing...' : 'Refresh History'}</span>
        </button>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {history.length === 0 ? (
          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-12 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#1f2333] border border-[#252a3a] text-slate-400 flex items-center justify-center mx-auto text-base">
              📋
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300">No migration jobs recorded yet</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Launch a migration from the Migrate tab to see full execution logs here.
              </p>
            </div>
            <button
              onClick={() => navigate('/migrate')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium"
            >
              Go to Migrate
            </button>
          </div>
        ) : (
          history.map((run, idx) => {
            const isExpanded = expandedJobId === run.job_id;
            const isSuccess = run.status === 'COMPLETED';
            const isFailed = run.status?.startsWith('FAILED');

            return (
              <div
                key={run.job_id || idx}
                className="bg-[#12151f] border border-[#252a3a] rounded-xl overflow-hidden transition-all"
              >
                {/* Summary Row */}
                <div
                  onClick={() => setExpandedJobId(isExpanded ? null : (run.job_id || `${idx}`))}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-[#181b26]"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isSuccess
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : isFailed
                        ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                        : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                    }`}>
                      {isSuccess ? '✓' : isFailed ? '✕' : '▲'}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-white">
                          {run.job_id || `Job #${history.length - idx}`}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                          isSuccess
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : isFailed
                            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                            : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                        }`}>
                          {run.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Started: {run.start_time ? new Date(run.start_time).toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">TABLES</span>
                      <span className="text-slate-200 font-bold">
                        {run.tables_completed}/{run.tables_total || run.selected_tables?.length || 0}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[10px]">DURATION</span>
                      <span className="text-slate-200 font-bold">{run.duration_seconds || 0}s</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleValidate(run);
                        }}
                        className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-200"
                      >
                        Validate
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRerun(run);
                        }}
                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded text-[11px] text-blue-300"
                      >
                        Re-run
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Drill-down Drawer */}
                {isExpanded && (
                  <div className="p-4 bg-[#0c0e14] border-t border-[#1e2230] space-y-4">
                    {/* Per Table Breakdown */}
                    {run.table_progress && Object.keys(run.table_progress).length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
                          Table Ingestion Results
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(run.table_progress).map(([tName, tProg]) => (
                            <div
                              key={tName}
                              className="p-2.5 bg-[#12151f] border border-[#1e2230] rounded-lg text-xs font-mono flex justify-between items-center"
                            >
                              <div className="truncate pr-2">
                                <span className="text-slate-200 font-bold block truncate">{tName}</span>
                                <span className="text-[10px] text-slate-500">
                                  {tProg.rows > 0 ? `${tProg.rows.toLocaleString()} rows` : ''} • {tProg.duration_seconds || 0}s
                                </span>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                tProg.status === 'COMPLETED'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}>
                                {tProg.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Logs */}
                    {run.logs && run.logs.length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                          Execution Log Snippet ({run.logs.length} lines)
                        </span>
                        <div className="bg-[#12151f] border border-[#1e2230] rounded-lg p-3 max-h-[160px] overflow-y-auto font-mono text-[10.5px] space-y-0.5">
                          {run.logs.map((l, lIdx) => (
                            <div key={lIdx} className="flex space-x-2">
                              <span className="text-slate-600 shrink-0">[{l.time}]</span>
                              <span className="text-slate-300">{l.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
