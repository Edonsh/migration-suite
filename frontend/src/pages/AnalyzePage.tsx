import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/contexts/MigrationContext';
import {
  api,
  type TableDetails,
  type ViewDetails,
  type ProcedureDetails,
} from '@/lib/api';

type ObjectCategory = 'tables' | 'views' | 'procedures';

export default function AnalyzePage() {
  const navigate = useNavigate();
  const {
    tables,
    views,
    procedures,
    selectedTables,
    toggleTable,
    selectAllTables,
    clearSelectedTables,
    loadingTables,
    tableError,
    fetchObjects,
    profiles,
    activeProfileId,
    activeProfile,
    selectProfile,
    saveProfile,
    creds,
  } = useMigration();

  // Active category tab in sidebar: tables | views | procedures
  const [activeCategory, setActiveCategory] = useState<ObjectCategory>('tables');
  const [searchQuery, setSearchQuery] = useState('');

  // Active object selection
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [activeProcedure, setActiveProcedure] = useState<string | null>(null);

  // Inspector details states
  const [tableDetails, setTableDetails] = useState<TableDetails | null>(null);
  const [viewDetails, setViewDetails] = useState<ViewDetails | null>(null);
  const [procDetails, setProcDetails] = useState<ProcedureDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Active inspector tabs
  const [activeTableTab, setActiveTableTab] = useState<'schema' | 'ddl' | 'sample'>('schema');
  const [activeViewTab, setActiveViewTab] = useState<'schema' | 'definition' | 'sample'>('schema');
  const [activeProcTab, setActiveProcTab] = useState<'params' | 'code' | 'recommendation'>('code');

  const [copiedCode, setCopiedCode] = useState(false);

  // Add connection modal inline
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newConnData, setNewConnData] = useState({
    name: '',
    snowflake_account: '',
    snowflake_user: '',
    snowflake_password: '',
    snowflake_warehouse: '',
    snowflake_database: '',
    snowflake_schema: '',
    snowflake_role: '',
  });
  const [savingConn, setSavingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  // Auto-select first item when object lists load
  useEffect(() => {
    if (activeCategory === 'tables') {
      if (tables.length > 0 && (!activeTable || !tables.includes(activeTable))) {
        setActiveTable(tables[0]);
      }
    } else if (activeCategory === 'views') {
      if (views.length > 0 && (!activeView || !views.includes(activeView))) {
        setActiveView(views[0]);
      }
    } else if (activeCategory === 'procedures') {
      if (procedures.length > 0 && (!activeProcedure || !procedures.includes(activeProcedure))) {
        setActiveProcedure(procedures[0]);
      }
    }
  }, [tables, views, procedures, activeCategory]);

  // Load Table details
  useEffect(() => {
    if (activeCategory !== 'tables' || !activeTable) {
      setTableDetails(null);
      return;
    }
    setLoadingDetails(true);
    api
      .analyzeTable(activeTable, activeProfileId, creds.snowflake_user ? creds : null)
      .then(setTableDetails)
      .catch((err) => {
        console.error('Analyze table error', err);
        setTableDetails(null);
      })
      .finally(() => setLoadingDetails(false));
  }, [activeTable, activeCategory, activeProfileId]);

  // Load View details
  useEffect(() => {
    if (activeCategory !== 'views' || !activeView) {
      setViewDetails(null);
      return;
    }
    setLoadingDetails(true);
    api
      .analyzeView(activeView, activeProfileId, creds.snowflake_user ? creds : null)
      .then(setViewDetails)
      .catch((err) => {
        console.error('Analyze view error', err);
        setViewDetails(null);
      })
      .finally(() => setLoadingDetails(false));
  }, [activeView, activeCategory, activeProfileId]);

  // Load Procedure details
  useEffect(() => {
    if (activeCategory !== 'procedures' || !activeProcedure) {
      setProcDetails(null);
      return;
    }
    setLoadingDetails(true);
    api
      .analyzeProcedure(activeProcedure, activeProfileId, creds.snowflake_user ? creds : null)
      .then(setProcDetails)
      .catch((err) => {
        console.error('Analyze procedure error', err);
        setProcDetails(null);
      })
      .finally(() => setLoadingDetails(false));
  }, [activeProcedure, activeCategory, activeProfileId]);

  // Filter current category items
  const currentItems = () => {
    let list: string[] = [];
    if (activeCategory === 'tables') list = tables;
    else if (activeCategory === 'views') list = views;
    else if (activeCategory === 'procedures') list = procedures;
    return list.filter((item) => item.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConn(true);
    setConnError(null);
    try {
      await saveProfile({
        name: newConnData.name || `${newConnData.snowflake_database || 'Snowflake'} (${newConnData.snowflake_user})`,
        snowflake_account: newConnData.snowflake_account,
        snowflake_user: newConnData.snowflake_user,
        snowflake_password: newConnData.snowflake_password,
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
              <span className="w-6 h-6 rounded bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold text-xs">
                SF
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Snowflake Connection:
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

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => fetchObjects(activeProfileId)}
              disabled={loadingTables}
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
              <span className="text-orange-400 font-semibold">{activeProfile.snowflake_database}.{activeProfile.snowflake_schema}</span>
            </div>
            <div>
              <span className="text-slate-500">User: </span>
              <span className="text-slate-300">{activeProfile.snowflake_user}</span>
            </div>
            <div>
              <span className="text-slate-500">Warehouse: </span>
              <span className="text-slate-300">{activeProfile.snowflake_warehouse}</span>
            </div>
            <div className="ml-auto flex items-center space-x-3 text-[10px]">
              <span className="text-blue-400">📊 {tables.length} Tables</span>
              <span className="text-indigo-400">👁️ {views.length} Views</span>
              <span className="text-amber-400">⚡ {procedures.length} Procedures</span>
            </div>
          </div>
        )}
      </div>

      {tableError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start justify-between font-mono">
          <div>
            <span className="font-bold block mb-0.5">Connection Notice</span>
            <span>{tableError}</span>
          </div>
          <button
            onClick={() => navigate('/connections')}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium text-xs ml-4"
          >
            Manage Connections
          </button>
        </div>
      )}

      {/* Main Grid: Left Object Explorer, Right Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Discovered Objects List */}
        <div className="lg:col-span-4 bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-3">
          {/* Category Tabs: Tables vs Views vs Stored Procedures */}
          <div className="grid grid-cols-3 gap-1 bg-[#0c0e14] p-1 rounded-lg border border-[#252a3a]">
            <button
              onClick={() => {
                setActiveCategory('tables');
                setSearchQuery('');
              }}
              className={`py-1.5 px-2 rounded text-xs font-semibold flex flex-col items-center transition-all ${
                activeCategory === 'tables'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📊 Tables</span>
              <span className="text-[10px] font-mono opacity-80">({tables.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveCategory('views');
                setSearchQuery('');
              }}
              className={`py-1.5 px-2 rounded text-xs font-semibold flex flex-col items-center transition-all ${
                activeCategory === 'views'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>👁️ Views</span>
              <span className="text-[10px] font-mono opacity-80">({views.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveCategory('procedures');
                setSearchQuery('');
              }}
              className={`py-1.5 px-2 rounded text-xs font-semibold flex flex-col items-center transition-all ${
                activeCategory === 'procedures'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>⚡ Procs</span>
              <span className="text-[10px] font-mono opacity-80">({procedures.length})</span>
            </button>
          </div>

          {/* Subheader info & selection actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {activeCategory === 'tables' && 'Base Tables'}
                {activeCategory === 'views' && 'SQL Views'}
                {activeCategory === 'procedures' && 'Stored Procedures'}
              </span>
              {activeCategory !== 'tables' && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 uppercase font-mono font-semibold">
                  View Only
                </span>
              )}
            </div>

            {activeCategory === 'tables' && (
              <div className="flex items-center space-x-2 text-[11px]">
                <button onClick={selectAllTables} className="text-blue-400 hover:underline font-medium">
                  All
                </button>
                <span className="text-slate-600">•</span>
                <button onClick={clearSelectedTables} className="text-slate-400 hover:underline font-medium">
                  None
                </button>
              </div>
            )}
          </div>

          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeCategory}...`}
              className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Discovered Items List */}
          <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
            {loadingTables ? (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <span>Discovering Snowflake objects...</span>
              </div>
            ) : currentItems().length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No {activeCategory} found.
              </div>
            ) : (
              currentItems().map((item) => {
                if (activeCategory === 'tables') {
                  const isSelected = selectedTables.includes(item);
                  const isActive = activeTable === item;
                  return (
                    <div
                      key={item}
                      onClick={() => setActiveTable(item)}
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
                            toggleTable(item);
                          }}
                          className="rounded border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                        />
                        <span className="font-mono text-xs truncate">{item}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-medium">
                          MIGRATE
                        </span>
                      )}
                    </div>
                  );
                } else if (activeCategory === 'views') {
                  const isActive = activeView === item;
                  return (
                    <div
                      key={item}
                      onClick={() => setActiveView(item)}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                          : 'bg-[#0c0e14]/40 border-[#1e2230] text-slate-300 hover:bg-[#1f2333]/40'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-xs text-indigo-400">👁️</span>
                        <span className="font-mono text-xs truncate">{item}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono">
                        VIEW
                      </span>
                    </div>
                  );
                } else {
                  // Stored Procedures
                  const isActive = activeProcedure === item;
                  return (
                    <div
                      key={item}
                      onClick={() => setActiveProcedure(item)}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-amber-600/20 border-amber-500/50 text-white'
                          : 'bg-[#0c0e14]/40 border-[#1e2230] text-slate-300 hover:bg-[#1f2333]/40'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-xs text-amber-400">⚡</span>
                        <span className="font-mono text-xs truncate">{item}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">
                        PROC
                      </span>
                    </div>
                  );
                }
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Inspector for Selected Object */}
        <div className="lg:col-span-8 bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-5">
          {loadingDetails ? (
            <div className="py-24 text-center space-y-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">
                Inspecting metadata for{' '}
                {activeCategory === 'tables'
                  ? activeTable
                  : activeCategory === 'views'
                  ? activeView
                  : activeProcedure}...
              </p>
            </div>
          ) : activeCategory === 'tables' ? (
            /* ================================================================ */
            /* TABLE INSPECTOR                                                  */
            /* ================================================================ */
            !tableDetails ? (
              <div className="py-24 text-center text-slate-500 text-xs">
                Select a table on the left to inspect column mappings, Delta DDL, and sample data.
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e2230]">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-white font-mono">{tableDetails.table_name}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                        100% COMPATIBLE
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target Delta Table: {tableDetails.target_table}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4 text-xs font-mono">
                    <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                      <span className="text-slate-500 block text-[10px]">TOTAL ROWS</span>
                      <span className="text-slate-200 font-bold">{tableDetails.row_count.toLocaleString()}</span>
                    </div>
                    <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                      <span className="text-slate-500 block text-[10px]">COLUMNS</span>
                      <span className="text-slate-200 font-bold">{tableDetails.column_count}</span>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex space-x-2 border-b border-[#1e2230] pb-2">
                  <button
                    onClick={() => setActiveTableTab('schema')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeTableTab === 'schema'
                        ? 'bg-[#1f2333] text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Column Type Mapping ({tableDetails.columns.length})
                  </button>
                  <button
                    onClick={() => setActiveTableTab('ddl')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeTableTab === 'ddl'
                        ? 'bg-[#1f2333] text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Delta Lake DDL Preview
                  </button>
                  <button
                    onClick={() => setActiveTableTab('sample')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeTableTab === 'sample'
                        ? 'bg-[#1f2333] text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sample Rows ({tableDetails.sample_rows.length})
                  </button>
                </div>

                {/* Table Tab Contents */}
                {activeTableTab === 'schema' && (
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
                        {tableDetails.columns.map((col) => (
                          <tr key={col.name} className="hover:bg-[#1f2333]/40">
                            <td className="p-2.5 font-bold text-slate-200">{col.name}</td>
                            <td className="p-2.5 text-slate-400">{col.source_type}</td>
                            <td className="p-2.5 text-sky-400 font-semibold">{col.databricks_type}</td>
                            <td className="p-2.5 text-slate-400">{col.nullable ? 'YES' : 'NO'}</td>
                            <td className="p-2.5">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
                                {col.compatibility}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTableTab === 'ddl' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-mono">Auto-generated Databricks Delta DDL:</span>
                      <button
                        onClick={() => handleCopy(tableDetails.generated_ddl)}
                        className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-200"
                      >
                        {copiedCode ? '✓ Copied!' : 'Copy SQL'}
                      </button>
                    </div>
                    <pre className="p-4 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                      <code>{tableDetails.generated_ddl}</code>
                    </pre>
                  </div>
                )}

                {activeTableTab === 'sample' && (
                  <div className="overflow-x-auto max-h-[380px] border border-[#1e2230] rounded-lg">
                    {tableDetails.sample_rows.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">No rows in this table</div>
                    ) : (
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1e2230]">
                          <tr>
                            {Object.keys(tableDetails.sample_rows[0]).map((k) => (
                              <th key={k} className="p-2.5 whitespace-nowrap">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                          {tableDetails.sample_rows.map((row, idx) => (
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
            )
          ) : activeCategory === 'views' ? (
            /* ================================================================ */
            /* VIEW INSPECTOR (VIEW-ONLY)                                       */
            /* ================================================================ */
            !viewDetails ? (
              <div className="py-24 text-center text-slate-500 text-xs">
                Select a view on the left to inspect its SQL definition, schema, and sample rows.
              </div>
            ) : (
              <>
                {/* View Summary Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e2230]">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-indigo-400 text-base">👁️</span>
                      <h3 className="text-base font-bold text-white font-mono">{viewDetails.view_name}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono font-semibold">
                        VIEW (VIEW-ONLY)
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target Equivalent: {viewDetails.target_view}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4 text-xs font-mono">
                    <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                      <span className="text-slate-500 block text-[10px]">OUTPUT COLUMNS</span>
                      <span className="text-slate-200 font-bold">{viewDetails.column_count}</span>
                    </div>
                    <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                      <span className="text-slate-500 block text-[10px]">MODE</span>
                      <span className="text-indigo-400 font-bold">SQL LOGIC</span>
                    </div>
                  </div>
                </div>

                {/* Info Notice Banner */}
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-200 flex items-start space-x-2 font-mono">
                  <span className="text-sm">ℹ️</span>
                  <div>
                    <span className="font-semibold block text-indigo-100">View-Only Analysis Object:</span>
                    <span>
                      Views are virtual SQL definitions. You can inspect their column types, source query logic, and live output rows here. Base tables are selected for data extraction and Delta Lake ingestion.
                    </span>
                  </div>
                </div>

                {/* View Tabs */}
                <div className="flex space-x-2 border-b border-[#1e2230] pb-2">
                  <button
                    onClick={() => setActiveViewTab('schema')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeViewTab === 'schema'
                        ? 'bg-[#1f2333] text-indigo-400 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Output Schema ({viewDetails.columns.length})
                  </button>
                  <button
                    onClick={() => setActiveViewTab('definition')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeViewTab === 'definition'
                        ? 'bg-[#1f2333] text-indigo-400 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SQL Definition & DDL
                  </button>
                  <button
                    onClick={() => setActiveViewTab('sample')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeViewTab === 'sample'
                        ? 'bg-[#1f2333] text-indigo-400 border border-indigo-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Live Preview Rows ({viewDetails.sample_rows.length})
                  </button>
                </div>

                {/* View Tab Contents */}
                {activeViewTab === 'schema' && (
                  <div className="overflow-x-auto max-h-[380px] border border-[#1e2230] rounded-lg">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1e2230]">
                        <tr>
                          <th className="p-2.5">Output Column</th>
                          <th className="p-2.5">Snowflake Source Type</th>
                          <th className="p-2.5">➔ Databricks SQL Type</th>
                          <th className="p-2.5">Nullable</th>
                          <th className="p-2.5">Compatibility</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                        {viewDetails.columns.map((col) => (
                          <tr key={col.name} className="hover:bg-[#1f2333]/40">
                            <td className="p-2.5 font-bold text-slate-200">{col.name}</td>
                            <td className="p-2.5 text-slate-400">{col.source_type}</td>
                            <td className="p-2.5 text-indigo-400 font-semibold">{col.databricks_type}</td>
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

                {activeViewTab === 'definition' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-mono">Snowflake Source Definition:</span>
                        <button
                          onClick={() => handleCopy(viewDetails.definition)}
                          className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-200"
                        >
                          {copiedCode ? '✓ Copied!' : 'Copy SQL'}
                        </button>
                      </div>
                      <pre className="p-4 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                        <code>{viewDetails.definition}</code>
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <span className="text-slate-400 font-mono text-xs">Databricks View Translation Stub:</span>
                      <pre className="p-4 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono text-indigo-300 overflow-x-auto leading-relaxed">
                        <code>{viewDetails.generated_view_ddl}</code>
                      </pre>
                    </div>
                  </div>
                )}

                {activeViewTab === 'sample' && (
                  <div className="overflow-x-auto max-h-[380px] border border-[#1e2230] rounded-lg">
                    {viewDetails.sample_rows.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">No output rows returned by view</div>
                    ) : (
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1e2230]">
                          <tr>
                            {Object.keys(viewDetails.sample_rows[0]).map((k) => (
                              <th key={k} className="p-2.5 whitespace-nowrap">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                          {viewDetails.sample_rows.map((row, idx) => (
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
            )
          ) : (
            /* ================================================================ */
            /* STORED PROCEDURE INSPECTOR (VIEW-ONLY)                           */
            /* ================================================================ */
            !procDetails ? (
              <div className="py-24 text-center text-slate-500 text-xs">
                Select a stored procedure on the left to inspect its source code and parameter signatures.
              </div>
            ) : (
              <>
                {/* Procedure Summary Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e2230]">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-amber-400 text-base">⚡</span>
                      <h3 className="text-base font-bold text-white font-mono">{procDetails.procedure_name}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-semibold">
                        PROCEDURE (VIEW-ONLY)
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Snowflake Procedural Logic
                    </span>
                  </div>

                  <div className="flex items-center space-x-4 text-xs font-mono">
                    <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                      <span className="text-slate-500 block text-[10px]">PARAMETERS</span>
                      <span className="text-slate-200 font-bold">{procDetails.parameter_count}</span>
                    </div>
                    <div className="bg-[#0c0e14] px-3 py-1.5 rounded-lg border border-[#252a3a]">
                      <span className="text-slate-500 block text-[10px]">DIALECT</span>
                      <span className="text-amber-400 font-bold">Snowflake SQL</span>
                    </div>
                  </div>
                </div>

                {/* Info Notice Banner */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200 flex items-start space-x-2 font-mono">
                  <span className="text-sm">ℹ️</span>
                  <div>
                    <span className="font-semibold block text-amber-100">Stored Procedure Analysis (View-Only):</span>
                    <span>
                      Stored procedures execute procedural logic in Snowflake. Inspect their signatures and source below to rewrite or automate them as Databricks SQL procedures, Python scripts, or PySpark workflows.
                    </span>
                  </div>
                </div>

                {/* Procedure Tabs */}
                <div className="flex space-x-2 border-b border-[#1e2230] pb-2">
                  <button
                    onClick={() => setActiveProcTab('code')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeProcTab === 'code'
                        ? 'bg-[#1f2333] text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Source Code
                  </button>
                  <button
                    onClick={() => setActiveProcTab('params')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeProcTab === 'params'
                        ? 'bg-[#1f2333] text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Parameters ({procDetails.parameters.length})
                  </button>
                  <button
                    onClick={() => setActiveProcTab('recommendation')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeProcTab === 'recommendation'
                        ? 'bg-[#1f2333] text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Databricks Migration Guide
                  </button>
                </div>

                {/* Procedure Tab Contents */}
                {activeProcTab === 'code' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-mono">Snowflake Procedure Source:</span>
                      <button
                        onClick={() => handleCopy(procDetails.source_code)}
                        className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-200"
                      >
                        {copiedCode ? '✓ Copied!' : 'Copy Code'}
                      </button>
                    </div>
                    <pre className="p-4 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono text-amber-200/90 overflow-x-auto leading-relaxed max-h-[420px]">
                      <code>{procDetails.source_code}</code>
                    </pre>
                  </div>
                )}

                {activeProcTab === 'params' && (
                  <div className="overflow-x-auto max-h-[380px] border border-[#1e2230] rounded-lg">
                    {procDetails.parameters.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">No parameters for this procedure</div>
                    ) : (
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0c0e14] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1e2230]">
                          <tr>
                            <th className="p-2.5">Parameter Name</th>
                            <th className="p-2.5">Mode</th>
                            <th className="p-2.5">Snowflake Data Type</th>
                            <th className="p-2.5">Databricks SQL Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#181b24] bg-[#0c0e14]/50">
                          {procDetails.parameters.map((p) => (
                            <tr key={p.name} className="hover:bg-[#1f2333]/40">
                              <td className="p-2.5 font-bold text-slate-200">{p.name}</td>
                              <td className="p-2.5">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    p.direction === 'IN'
                                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                      : p.direction === 'OUT'
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                      : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                                  }`}
                                >
                                  {p.direction}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-300">{p.source_type}</td>
                              <td className="p-2.5 text-sky-400 font-semibold">{p.databricks_type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeProcTab === 'recommendation' && (
                  <div className="space-y-2">
                    <span className="text-slate-400 font-mono text-xs">
                      Databricks SQL / Python Conversion Strategy:
                    </span>
                    <pre className="p-4 bg-[#0c0e14] border border-[#1e2230] rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
                      <code>{procDetails.recommendation}</code>
                    </pre>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* Inline Modal: Add Snowflake Connection Profile */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12151f] border border-[#252a3a] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e2230]">
              <div className="flex items-center space-x-2">
                <span className="text-orange-400 font-bold text-sm">SF</span>
                <h3 className="text-base font-bold text-white">Add Snowflake Profile</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {connError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
                {connError}
              </div>
            )}

            <form onSubmit={handleCreateConnection} className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Snowflake Test DB"
                  value={newConnData.name}
                  onChange={(e) => setNewConnData({ ...newConnData, name: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Account *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. xy12345.us-east-1"
                  value={newConnData.snowflake_account}
                  onChange={(e) => setNewConnData({ ...newConnData, snowflake_account: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Database *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GMIGRATE_TEST"
                  value={newConnData.snowflake_database}
                  onChange={(e) => setNewConnData({ ...newConnData, snowflake_database: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="demo_user"
                    value={newConnData.snowflake_user}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_user: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                    Schema *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="TEST_SCHEMA"
                    value={newConnData.snowflake_schema}
                    onChange={(e) => setNewConnData({ ...newConnData, snowflake_schema: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Warehouse *
                </label>
                <input
                  type="text"
                  required
                  placeholder="COMPUTE_WH"
                  value={newConnData.snowflake_warehouse}
                  onChange={(e) => setNewConnData({ ...newConnData, snowflake_warehouse: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newConnData.snowflake_password}
                  onChange={(e) => setNewConnData({ ...newConnData, snowflake_password: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 bg-[#1f2333] hover:bg-[#252a3a] text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConn}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold disabled:opacity-50"
                >
                  {savingConn ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
