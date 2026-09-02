import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/contexts/MigrationContext';
import { api, type TableDetails } from '@/lib/api';

export default function AnalyzePage() {
  const navigate = useNavigate();
  const {
    tables,
    selectedTables,
    toggleTable,
    selectAllTables,
    clearSelectedTables,
    loadingTables,
    tableError,
    fetchTables,
    creds,
    authMode,
  } = useMigration();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'schema' | 'ddl' | 'sample'>('schema');
  const [copiedDdl, setCopiedDdl] = useState(false);

  // Auto select first table for analysis
  useEffect(() => {
    if (tables.length > 0 && !activeTable) {
      setActiveTable(tables[0]);
    }
  }, [tables]);

  // Load details when active table changes
  useEffect(() => {
    if (!activeTable) return;
    setLoadingDetails(true);
    api
      .analyzeTable(activeTable, authMode === 'custom' ? creds : null)
      .then(setDetails)
      .catch((err) => console.error('Analyze table error', err))
      .finally(() => setLoadingDetails(false));
  }, [activeTable, authMode]);

  const filteredTables = tables.filter((t) =>
    t.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyDdl = () => {
    if (details?.generated_ddl) {
      navigator.clipboard.writeText(details.generated_ddl);
      setCopiedDdl(true);
      setTimeout(() => setCopiedDdl(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230]">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
              STEP 1 OF 3
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Schema Introspection & Analysis</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Introspect Snowflake table schemas, inspect column type conversions to Delta Lake, and preview SQL DDL.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchTables()}
            disabled={loadingTables}
            className="px-3 py-1.5 bg-[#12151f] hover:bg-[#1f2333] border border-[#252a3a] rounded-lg text-xs font-medium text-slate-300 transition-all flex items-center space-x-1.5"
          >
            <span>↻</span>
            <span>{loadingTables ? 'Discovering...' : 'Refresh Tables'}</span>
          </button>

          <button
            onClick={() => navigate('/migrate')}
            disabled={selectedTables.length === 0}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Proceed to Migrate</span>
            <span className="bg-blue-700/60 px-1.5 py-0.2 rounded text-[10px] font-mono">
              {selectedTables.length}
            </span>
            <span>➔</span>
          </button>
        </div>
      </div>

      {tableError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start justify-between">
          <div>
            <span className="font-bold block mb-0.5">Connection Error</span>
            <span>{tableError}</span>
          </div>
          <button
            onClick={() => navigate('/connections')}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium text-xs ml-4"
          >
            Check Connections
          </button>
        </div>
      )}

      {/* Main Grid: Left Table List, Right Schema Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tables List */}
        <div className="lg:col-span-4 bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Snowflake Tables ({tables.length})
            </span>
            <div className="flex items-center space-x-2 text-[11px]">
              <button
                onClick={selectAllTables}
                className="text-blue-400 hover:underline font-medium"
              >
                All
              </button>
              <span className="text-slate-600">•</span>
              <button
                onClick={clearSelectedTables}
                className="text-slate-400 hover:underline font-medium"
              >
                None
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tables..."
              className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Table list */}
          <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
            {loadingTables ? (
              <div className="py-8 text-center text-xs text-slate-500">Discovering tables from schema...</div>
            ) : filteredTables.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No matching tables found</div>
            ) : (
              filteredTables.map((tbl) => {
                const isSelected = selectedTables.includes(tbl);
                const isActive = activeTable === tbl;
                return (
                  <div
                    key={tbl}
                    onClick={() => setActiveTable(tbl)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                      isActive
                        ? 'bg-blue-600/15 border-blue-500/50 text-white'
                        : 'bg-[#0c0e14]/40 border-[#1e2230] text-slate-300 hover:bg-[#1f2333]/40'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleTable(tbl);
                        }}
                        className="rounded border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="font-mono text-xs truncate">{tbl}</span>
                    </div>

                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                        MIGRATE
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Schema Inspector */}
        <div className="lg:col-span-8 bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-5">
          {loadingDetails ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Introspecting schema for {activeTable}...</p>
            </div>
          ) : !details ? (
            <div className="py-24 text-center text-slate-500 text-xs">
              Select a table from the left to inspect its schema and compatibility.
            </div>
          ) : (
            <>
              {/* Table Summary Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e2230]">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white font-mono">{details.table_name}</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                      100% COMPATIBLE
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Target: {details.target_table}
                  </span>
                </div>

                <div className="flex items-center space-x-4 text-xs font-mono">
                  <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                    <span className="text-slate-500 block text-[10px]">TOTAL ROWS</span>
                    <span className="text-slate-200 font-bold">{details.row_count.toLocaleString()}</span>
                  </div>
                  <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                    <span className="text-slate-500 block text-[10px]">COLUMNS</span>
                    <span className="text-slate-200 font-bold">{details.column_count}</span>
                  </div>
                </div>
              </div>

              {/* Inspector Tabs */}
              <div className="flex space-x-2 border-b border-[#1e2230] pb-2">
                <button
                  onClick={() => setActiveTab('schema')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeTab === 'schema'
                      ? 'bg-[#1f2333] text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Column Type Mapping ({details.columns.length})
                </button>
                <button
                  onClick={() => setActiveTab('ddl')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeTab === 'ddl'
                      ? 'bg-[#1f2333] text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Delta Lake DDL Preview
                </button>
                <button
                  onClick={() => setActiveTab('sample')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeTab === 'sample'
                      ? 'bg-[#1f2333] text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sample Rows ({details.sample_rows.length})
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'schema' && (
                <div className="overflow-x-auto max-h-[380px] border border-[#1e2230] rounded-lg">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1e2230]">
                      <tr>
                        <th className="p-2.5">Column Name</th>
                        <th className="p-2.5">Snowflake Source Type</th>
                        <th className="p-2.5">➔ Databricks Delta Type</th>
                        <th className="p-2.5">Nullable</th>
                        <th className="p-2.5">Conversion Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                      {details.columns.map((col) => (
                        <tr key={col.name} className="hover:bg-[#1f2333]/40">
                          <td className="p-2.5 font-bold text-slate-200">{col.name}</td>
                          <td className="p-2.5 text-slate-400">{col.snowflake_type}</td>
                          <td className="p-2.5 text-sky-400 font-semibold">{col.databricks_type}</td>
                          <td className="p-2.5 text-slate-400">{col.nullable ? 'YES' : 'NO'}</td>
                          <td className="p-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              {col.compatibility}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'ddl' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono">Auto-generated Databricks Delta DDL:</span>
                    <button
                      onClick={handleCopyDdl}
                      className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-200"
                    >
                      {copiedDdl ? '✓ Copied!' : 'Copy SQL'}
                    </button>
                  </div>
                  <pre className="p-4 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                    <code>{details.generated_ddl}</code>
                  </pre>
                </div>
              )}

              {activeTab === 'sample' && (
                <div className="overflow-x-auto max-h-[380px] border border-[#1e2230] rounded-lg">
                  {details.sample_rows.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">No rows in this table</div>
                  ) : (
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1e2230]">
                        <tr>
                          {Object.keys(details.sample_rows[0]).map((k) => (
                            <th key={k} className="p-2.5 whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                        {details.sample_rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#1f2333]/40">
                            {Object.values(row).map((val, cIdx) => (
                              <td key={cIdx} className="p-2.5 whitespace-nowrap text-slate-300">
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
