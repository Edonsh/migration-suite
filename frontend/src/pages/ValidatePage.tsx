import { useState, useEffect } from 'react';
import { useMigration } from '@/contexts/MigrationContext';
import { api, type ValidationReport } from '@/lib/api';

export default function ValidatePage() {
  const { tables, selectedTables, activeProfileId, creds } = useMigration();
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatedTables, setValidatedTables] = useState<string[]>([]);

  // Default to selected tables or all tables
  useEffect(() => {
    if (selectedTables.length > 0) {
      setValidatedTables(selectedTables);
    } else if (tables.length > 0) {
      setValidatedTables(tables);
    }
  }, [selectedTables, tables]);

  const handleRunValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.runValidation(
        validatedTables.length > 0 ? validatedTables : undefined,
        activeProfileId,
        creds.snowflake_user ? creds : null
      );
      setReport(result);
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230]">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
              STEP 3 OF 3
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Post-Migration Reconciliation</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Compare Snowflake source counts vs. Databricks Unity Catalog Delta tables to confirm 100% data fidelity.
          </p>
        </div>

        <button
          onClick={handleRunValidation}
          disabled={loading || tables.length === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Querying Source & Target...</span>
            </>
          ) : (
            <>
              <span>✓ Run Row-Count Reconciliation</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 font-mono">
          ✕ {error}
        </div>
      )}

      {/* Summary Cards */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              OVERALL MATCH RATE
            </span>
            <div className="flex items-baseline space-x-2">
              <span className={`text-2xl font-bold font-mono ${
                report.overall_match_rate === 100 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {report.overall_match_rate}%
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {report.status}
              </span>
            </div>
          </div>

          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              TABLES VALIDATED
            </span>
            <div className="text-2xl font-bold font-mono text-white">
              {report.passed_tables} / {report.total_tables}
            </div>
          </div>

          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              TOTAL ROWS (SNOWFLAKE ➔ DELTA)
            </span>
            <div className="text-2xl font-bold font-mono text-sky-400">
              {report.total_source_rows.toLocaleString()}
            </div>
          </div>

          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              ROW DISCREPANCY
            </span>
            <div className={`text-2xl font-bold font-mono ${
              report.total_difference === 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {report.total_difference.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Table */}
      <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Reconciliation Breakdown by Table
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {report ? `${report.tables.length} tables verified` : 'Ready to validate'}
          </span>
        </div>

        {!report && !loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <div>
              <p className="text-xs text-slate-300 font-medium">Ready to validate migrated tables</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click &quot;Run Row-Count Reconciliation&quot; above to query both Snowflake and Databricks SQL Warehouse.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Executing COUNT(*) queries against Snowflake and Databricks...</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#1e2230] rounded-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] border-b border-[#1e2230]">
                <tr>
                  <th className="p-3">Table Name</th>
                  <th className="p-3">Target (Unity Catalog)</th>
                  <th className="p-3">Snowflake Rows</th>
                  <th className="p-3">Databricks Delta Rows</th>
                  <th className="p-3">Difference</th>
                  <th className="p-3">Match %</th>
                  <th className="p-3">Reconciliation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                {report?.tables.map((t) => (
                  <tr key={t.table_name} className="hover:bg-[#1f2333]/40">
                    <td className="p-3 font-bold text-slate-200">{t.table_name}</td>
                    <td className="p-3 text-slate-400 truncate max-w-[200px]" title={t.target_table}>
                      {t.target_table}
                    </td>
                    <td className="p-3 text-slate-200">
                      {t.snowflake_rows >= 0 ? t.snowflake_rows.toLocaleString() : 'Error'}
                    </td>
                    <td className="p-3 text-sky-400 font-semibold">
                      {t.databricks_rows >= 0 ? t.databricks_rows.toLocaleString() : 'Error'}
                    </td>
                    <td className="p-3">
                      <span className={t.difference === 0 ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                        {t.difference >= 0 ? t.difference.toLocaleString() : '—'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        t.match_percentage === 100
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                      }`}>
                        {t.match_percentage}%
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        t.status === 'PASSED'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}>
                        {t.status === 'PASSED' ? '✓ PASSED' : '✕ FAILED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
