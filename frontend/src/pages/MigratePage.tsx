import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMigration } from '@/contexts/MigrationContext';
import { api, type DDLGenerationResult } from '@/lib/api';

type TabMode = 'ddl' | 'data';
type ObjectCategory = 'table' | 'view' | 'procedure';

export default function MigratePage() {
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
    activeProfileId,
    activeProfile,
    creds,
    status,
  } = useMigration();

  // Mode Selection: DDL Generation via Lakebridge vs Data Extraction Pipeline
  const [activeTabMode, setActiveTabMode] = useState<TabMode>('ddl');

  // ─── Lakebridge DDL Generation State ─────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<ObjectCategory>('table');
  const [selectedObjects, setSelectedObjects] = useState<string[]>([]);
  const [objectSearch, setObjectSearch] = useState('');
  const [executeInDatabricks, setExecuteInDatabricks] = useState(false);
  const [generatingDDL, setGeneratingDDL] = useState(false);
  const [ddlResults, setDdlResults] = useState<DDLGenerationResult[]>([]);
  const [ddlError, setDdlError] = useState<string | null>(null);
  const [activeDdlView, setActiveDdlView] = useState<Record<string, 'databricks' | 'snowflake'>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ─── Data Migration Pipeline State ───────────────────────────────────────────
  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-select all objects when switching category if none selected
  const currentObjectPool =
    selectedCategory === 'table'
      ? tables
      : selectedCategory === 'view'
      ? views
      : procedures;

  useEffect(() => {
    setSelectedObjects(currentObjectPool);
  }, [selectedCategory, tables, views, procedures]);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [status?.logs]);

  // ─── Handlers for DDL Generator ─────────────────────────────────────────────
  const toggleObject = (name: string) => {
    setSelectedObjects((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const selectAllCategoryObjects = () => {
    setSelectedObjects(currentObjectPool);
  };

  const clearSelectedCategoryObjects = () => {
    setSelectedObjects([]);
  };

  const handleGenerateDDL = async () => {
    if (selectedObjects.length === 0) return;
    setGeneratingDDL(true);
    setDdlError(null);
    try {
      const explicitCreds = activeProfileId ? null : (creds.snowflake_user ? creds : null);
      const response = await api.generateDDL(
        selectedCategory,
        selectedObjects,
        executeInDatabricks,
        activeProfileId,
        explicitCreds
      );
      setDdlResults(response.results || []);
    } catch (err: any) {
      setDdlError(err.message || 'Failed to generate DDL with Lakebridge');
    } finally {
      setGeneratingDDL(false);
    }
  };

  const handleExecuteSingleDDL = async (result: DDLGenerationResult) => {
    setGeneratingDDL(true);
    try {
      const explicitCreds = activeProfileId ? null : (creds.snowflake_user ? creds : null);
      const response = await api.generateDDL(
        result.object_type as ObjectCategory,
        [result.object_name],
        true,
        activeProfileId,
        explicitCreds
      );
      if (response.results && response.results.length > 0) {
        const updated = response.results[0];
        setDdlResults((prev) =>
          prev.map((r) => (r.object_name === updated.object_name ? updated : r))
        );
      }
    } catch (err: any) {
      alert('Execution error: ' + (err.message || 'Unknown error'));
    } finally {
      setGeneratingDDL(false);
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ─── Handlers for Data Pipeline ─────────────────────────────────────────────
  const handleStartMigration = async () => {
    if (selectedTables.length === 0) return;
    setStarting(true);
    setErrorMessage(null);
    try {
      const explicitCreds = activeProfileId ? null : (creds.snowflake_user ? creds : null);
      await api.startMigration(selectedTables, activeProfileId, explicitCreds);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to trigger migration pipeline');
    } finally {
      setStarting(false);
    }
  };

  const filteredObjects = currentObjectPool.filter((obj) =>
    obj.toLowerCase().includes(objectSearch.toLowerCase())
  );

  const filteredTables = tables.filter((t) =>
    t.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const isRunning = status?.status === 'RUNNING';
  const isCompleted = status?.status === 'COMPLETED';
  const isFailed = status?.status?.startsWith('FAILED');

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230]">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
              STEP 2 OF 3
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Migration & DDL Generation</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Transpile and deploy Snowflake DDLs (tables, views, procedures) using Databricks Lakebridge, or launch the automated Delta data pipeline.
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

      {/* Navigation Tabs between DDL Generation & Data Pipeline */}
      <div className="flex items-center space-x-3 border-b border-[#1e2230] pb-2">
        <button
          onClick={() => setActiveTabMode('ddl')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTabMode === 'ddl'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1e2d]'
          }`}
        >
          <span className="text-sm">⚡</span>
          <span>Lakebridge DDL & Schema Deployment</span>
          <span className="px-1.5 py-0.2 bg-blue-700/50 text-[10px] rounded font-mono">
            {tables.length + views.length + procedures.length} Objects
          </span>
        </button>

        <button
          onClick={() => setActiveTabMode('data')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTabMode === 'data'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1e2d]'
          }`}
        >
          <span className="text-sm">🚀</span>
          <span>Data Extraction Pipeline (COPY INTO)</span>
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          )}
        </button>
      </div>

      {/* TAB 1: LAKEBRIDGE DDL GENERATOR & DEPLOYMENT */}
      {activeTabMode === 'ddl' && (
        <div className="space-y-6">
          {ddlError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 font-mono">
              ✕ {ddlError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Object Category Selection & Items */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4 shadow-xl">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    1. Select Object Type
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setSelectedCategory('table')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all border ${
                        selectedCategory === 'table'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                          : 'bg-[#0c0e14] border-[#1e2230] text-slate-400 hover:bg-[#1f2333]'
                      }`}
                    >
                      <span className="font-bold">Tables</span>
                      <span className="text-[10px] text-slate-500 font-mono">({tables.length})</span>
                    </button>

                    <button
                      onClick={() => setSelectedCategory('view')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all border ${
                        selectedCategory === 'view'
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                          : 'bg-[#0c0e14] border-[#1e2230] text-slate-400 hover:bg-[#1f2333]'
                      }`}
                    >
                      <span className="font-bold">Views</span>
                      <span className="text-[10px] text-slate-500 font-mono">({views.length})</span>
                    </button>

                    <button
                      onClick={() => setSelectedCategory('procedure')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all border ${
                        selectedCategory === 'procedure'
                          ? 'bg-amber-600/20 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-[#0c0e14] border-[#1e2230] text-slate-400 hover:bg-[#1f2333]'
                      }`}
                    >
                      <span className="font-bold">Procedures</span>
                      <span className="text-[10px] text-slate-500 font-mono">({procedures.length})</span>
                    </button>
                  </div>
                </div>

                {/* Object Selection Header */}
                <div className="flex items-center justify-between pt-2 border-t border-[#1e2230]">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    {selectedCategory.toUpperCase()}S ({selectedObjects.length}/{currentObjectPool.length})
                  </h4>
                  <div className="flex items-center space-x-2 text-[11px]">
                    <button
                      onClick={selectAllCategoryObjects}
                      disabled={generatingDDL}
                      className="text-blue-400 hover:underline font-medium disabled:opacity-50"
                    >
                      All
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      onClick={clearSelectedCategoryObjects}
                      disabled={generatingDDL}
                      className="text-slate-400 hover:underline font-medium disabled:opacity-50"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Filter Input */}
                <input
                  type="text"
                  value={objectSearch}
                  onChange={(e) => setObjectSearch(e.target.value)}
                  placeholder={`Search ${selectedCategory}s...`}
                  disabled={generatingDDL}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                />

                {/* Object Checkbox List */}
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {loadingTables ? (
                    <div className="py-6 text-center text-xs text-slate-500">Loading {selectedCategory}s...</div>
                  ) : filteredObjects.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No {selectedCategory}s found in schema
                    </div>
                  ) : (
                    filteredObjects.map((name) => {
                      const isSelected = selectedObjects.includes(name);
                      return (
                        <label
                          key={name}
                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-blue-600/10 border-blue-500/40 text-white'
                              : 'bg-[#0c0e14]/40 border-[#1e2230] text-slate-400 hover:bg-[#1f2333]/30'
                          } ${generatingDDL ? 'pointer-events-none opacity-80' : ''}`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleObject(name)}
                              disabled={generatingDDL}
                              className="rounded border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                            />
                            <span className="font-mono text-xs">{name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono uppercase">
                            {selectedCategory}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>

                {/* Databricks Execution Toggle */}
                <div className="p-3 bg-[#0c0e14] border border-[#1e2230] rounded-lg space-y-2 text-xs">
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={executeInDatabricks}
                      onChange={(e) => setExecuteInDatabricks(e.target.checked)}
                      disabled={generatingDDL}
                      className="mt-0.5 rounded border-slate-700 text-blue-500 focus:ring-0 w-4 h-4"
                    />
                    <div>
                      <span className="font-semibold text-slate-200 block">
                        Execute directly in Databricks SQL Warehouse
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Creates or updates the table/view/procedure in Unity Catalog immediately. If unchecked, generates DDL preview only.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Generate / Deploy Button */}
                <button
                  onClick={handleGenerateDDL}
                  disabled={selectedObjects.length === 0 || generatingDDL}
                  className={`w-full py-3 rounded-lg font-semibold text-xs transition-all flex items-center justify-center space-x-2 ${
                    selectedObjects.length === 0 || generatingDDL
                      ? 'bg-[#1f2333] text-slate-500 border border-[#252a3a] cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/25'
                  }`}
                >
                  {generatingDDL ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Transpiling with Lakebridge...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ Generate Lakebridge DDL</span>
                      <span className="bg-black/30 px-2 py-0.5 rounded text-[10px]">
                        {selectedObjects.length} {selectedCategory}s
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Lakebridge Transpiled Results & DDL Code */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e2230]">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Lakebridge Transpiled DDL Results
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Review transpiled Databricks SQL syntax and deployment status below.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    {ddlResults.length} Result{ddlResults.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {ddlResults.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 space-y-3">
                    <div className="text-3xl">📜</div>
                    <p className="text-xs font-mono">
                      No DDL generated yet. Select objects on the left and click "Generate Lakebridge DDL".
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {ddlResults.map((res) => {
                      const viewMode = activeDdlView[res.object_name] || 'databricks';
                      const codeToShow =
                        viewMode === 'databricks' ? res.generated_ddl : res.snowflake_ddl;
                      const hasExecResult = !!res.execution_result;
                      const execSuccess = res.execution_result?.status === 'SUCCEEDED';

                      return (
                        <div
                          key={res.object_name}
                          className="bg-[#0c0e14] border border-[#1e2230] rounded-xl overflow-hidden space-y-2 p-4"
                        >
                          {/* Item Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1a1e2d]">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-white font-mono">
                                {res.object_name}
                              </span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                {res.object_type}
                              </span>
                              {res.lakebridge_used ? (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center space-x-1">
                                  <span>✦</span>
                                  <span>Lakebridge Transpiled</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
                                  Snowflake Source / Fallback
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              {hasExecResult ? (
                                <span
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                    execSuccess
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                  }`}
                                >
                                  {execSuccess ? '✓ DEPLOYED IN DATABRICKS' : '✕ DEPLOY FAILED'}
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleExecuteSingleDDL(res)}
                                  disabled={generatingDDL}
                                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded text-[11px] font-mono transition-all disabled:opacity-50"
                                >
                                  Deploy to Databricks
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Error Banner if any */}
                          {(res.error || res.execution_result?.error) && (
                            <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] font-mono text-rose-400">
                              {res.error || res.execution_result?.error}
                            </div>
                          )}

                          {/* Code Tabs & Copy */}
                          <div className="flex items-center justify-between text-xs pt-1">
                            <div className="flex space-x-1">
                              <button
                                onClick={() =>
                                  setActiveDdlView((prev) => ({
                                    ...prev,
                                    [res.object_name]: 'databricks',
                                  }))
                                }
                                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                                  viewMode === 'databricks'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                Databricks SQL DDL
                              </button>
                              <button
                                onClick={() =>
                                  setActiveDdlView((prev) => ({
                                    ...prev,
                                    [res.object_name]: 'snowflake',
                                  }))
                                }
                                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                                  viewMode === 'snowflake'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                Source Snowflake DDL
                              </button>
                            </div>

                            <button
                              onClick={() => handleCopy(res.object_name, codeToShow)}
                              className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] font-mono text-slate-300 transition-all"
                            >
                              {copiedKey === res.object_name ? '✓ Copied!' : 'Copy SQL'}
                            </button>
                          </div>

                          {/* Code Display */}
                          <pre className="p-3 bg-[#08090d] border border-[#1a1e2d] rounded-lg text-slate-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[220px]">
                            {codeToShow || '-- No DDL available'}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATA EXTRACTION PIPELINE (PARQUET & COPY INTO) */}
      {activeTabMode === 'data' && (
        <div className="space-y-6">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 font-mono">
              ✕ {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Table Selection & Action */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4 shadow-xl">
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
              <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                      PIPELINE STATUS
                    </span>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-base font-bold text-white font-mono">
                        {status?.stage || 'IDLE'}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                          isRunning
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                            : isCompleted
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : isFailed
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
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

                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${
                              tProg.status === 'COMPLETED'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : tProg.status === 'IN_PROGRESS'
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            {tProg.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Live Streaming Log Terminal */}
              <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-4 space-y-2 shadow-xl">
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
                    <div className="text-slate-600 text-center py-6">
                      Logs will stream here during execution...
                    </div>
                  ) : (
                    status.logs.map((log, idx) => (
                      <div key={idx} className="flex space-x-2">
                        <span className="text-slate-600 shrink-0">[{log.time}]</span>
                        <span
                          className={`shrink-0 font-bold ${
                            log.level === 'ERROR'
                              ? 'text-rose-400'
                              : log.level === 'WARN'
                              ? 'text-amber-400'
                              : 'text-sky-400'
                          }`}
                        >
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
      )}
    </div>
  );
}