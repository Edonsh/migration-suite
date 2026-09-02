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
    profiles,
    activeProfileId,
    activeProfile,
    selectProfile,
    saveProfile,
    creds,
  } = useMigration();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'schema' | 'ddl' | 'sample'>('schema');
  const [copiedDdl, setCopiedDdl] = useState(false);

  // Add connection modal inline
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newConnData, setNewConnData] = useState({
    name: '',
    snowflake_user: '',
    snowflake_password: '',
    snowflake_account: '',
    snowflake_warehouse: '',
    snowflake_database: '',
    snowflake_schema: '',
    snowflake_role: '',
  });
  const [savingConn, setSavingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  // Auto select first table when tables load
  useEffect(() => {
    if (tables.length > 0) {
      if (!activeTable || !tables.includes(activeTable)) {
        setActiveTable(tables[0]);
      }
    } else {
      setActiveTable(null);
      setDetails(null);
    }
  }, [tables]);

  // Load details when active table changes
  useEffect(() => {
    if (!activeTable) {
      setDetails(null);
      return;
    }
    setLoadingDetails(true);
    api
      .analyzeTable(activeTable, activeProfileId, creds.snowflake_user ? creds : null)
      .then(setDetails)
      .catch((err) => {
        console.error('Analyze table error', err);
        setDetails(null);
      })
      .finally(() => setLoadingDetails(false));
  }, [activeTable, activeProfileId]);

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

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConn(true);
    setConnError(null);
    try {
      await saveProfile({
        name: newConnData.name || `${newConnData.snowflake_database}.${newConnData.snowflake_schema}`,
        snowflake_user: newConnData.snowflake_user,
        snowflake_password: newConnData.snowflake_password,
        snowflake_account: newConnData.snowflake_account,
        snowflake_warehouse: newConnData.snowflake_warehouse,
        snowflake_database: newConnData.snowflake_database,
        snowflake_schema: newConnData.snowflake_schema,
        snowflake_role: newConnData.snowflake_role,
      });
      setIsAddModalOpen(false);
    } catch (err: any) {
      setConnError(err.message || 'Failed to save connection');
    } finally {
      setSavingConn(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Section: Connection Selector & Action Bar */}
      <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Connection Profile Selection */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-xs">
                ❄
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Source Snowflake Connection:
              </span>
            </div>

            {profiles.length > 0 ? (
              <select
                value={activeProfileId || ''}
                onChange={(e) => selectProfile(e.target.value)}
                className="bg-[#0c0e14] border border-[#252a3a] text-slate-200 text-xs font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.snowflake_database}.{p.snowflake_schema})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-amber-400 font-mono">No connections saved</span>
            )}

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded-lg text-xs font-medium text-slate-300 transition-all"
            >
              + Add New
            </button>
          </div>

          {/* Introspect / Proceed Buttons */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => fetchTables(activeProfileId)}
              disabled={loadingTables || !activeProfileId}
              className="px-3 py-1.5 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded-lg text-xs font-semibold text-slate-200 transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              <span>{loadingTables ? 'Introspecting...' : '↻ Connect & Introspect'}</span>
            </button>

            <button
              onClick={() => navigate('/migrate')}
              disabled={selectedTables.length === 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Proceed to Migrate ({selectedTables.length})</span>
              <span>➔</span>
            </button>
          </div>
        </div>

        {/* Selected Connection Metadata Pill */}
        {activeProfile && (
          <div className="pt-2 border-t border-[#1e2230] flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-mono text-slate-400">
            <div>
              <span className="text-slate-500">Account: </span>
              <span className="text-slate-300">{activeProfile.snowflake_account}</span>
            </div>
            <div>
              <span className="text-slate-500">Database: </span>
              <span className="text-slate-300">{activeProfile.snowflake_database}</span>
            </div>
            <div>
              <span className="text-slate-500">Schema: </span>
              <span className="text-slate-300">{activeProfile.snowflake_schema}</span>
            </div>
            <div>
              <span className="text-slate-500">Warehouse: </span>
              <span className="text-slate-300">{activeProfile.snowflake_warehouse}</span>
            </div>
            <div>
              <span className="text-slate-500">User: </span>
              <span className="text-slate-300">{activeProfile.snowflake_user}</span>
            </div>
          </div>
        )}
      </div>

      {tableError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start justify-between font-mono">
          <div>
            <span className="font-bold block mb-0.5">Connection Error</span>
            <span>{tableError}</span>
          </div>
          <button
            onClick={() => navigate('/connections')}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium text-xs ml-4"
          >
            Fix Credentials
          </button>
        </div>
      )}

      {/* Main Grid: Left Table List, Right Schema Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tables List */}
        <div className="lg:col-span-4 bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tables in {activeProfile?.snowflake_database || 'Snowflake'} ({tables.length})
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
              placeholder="Search discovered tables..."
              className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Table list */}
          <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
            {loadingTables ? (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <span>Introspecting schema from Snowflake...</span>
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {profiles.length === 0
                  ? 'No connection configured yet. Click "+ Add New" above.'
                  : 'No tables found in this schema.'}
              </div>
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
              {tables.length === 0
                ? 'Select a Snowflake connection and click "Connect & Introspect" to begin analysis.'
                : 'Select a table on the left to inspect column mappings, DDL, and sample data.'}
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

      {/* Inline Modal: Add Snowflake Connection Profile */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#12151f] border border-[#252a3a] rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-[#1e2230]">
              <h3 className="font-bold text-base text-white">
                Add Snowflake Connection Profile
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {connError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 font-mono">
                ✕ {connError}
              </div>
            )}

            <form onSubmit={handleCreateConnection} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Profile Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Production DW / Sales DB"
                  value={newConnData.name}
                  onChange={(e) => setNewConnData({ ...newConnData, name: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Snowflake User</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., EGLOBAL1008"
                    value={newConnData.snowflake_user}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_user: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newConnData.snowflake_password}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_password: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Account Identifier</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., EZXHWVO-SM43903"
                    value={newConnData.snowflake_account}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_account: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Warehouse</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., COMPUTE_WH"
                    value={newConnData.snowflake_warehouse}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_warehouse: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Database</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., MIGRATION_DB"
                    value={newConnData.snowflake_database}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_database: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Schema</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., SOURCE_DATA"
                    value={newConnData.snowflake_schema}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_schema: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Role (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., ACCOUNTADMIN"
                    value={newConnData.snowflake_role}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_role: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[#1e2230]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-[#1f2333] hover:bg-[#252a3a] text-slate-300 rounded-lg font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConn}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs shadow-lg shadow-blue-500/20"
                >
                  {savingConn ? 'Connecting...' : 'Save & Introspect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
