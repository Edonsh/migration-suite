import { useState, useEffect } from 'react';
import { api, type ConnectionsStatus } from '@/lib/api';
import { useMigration } from '@/contexts/MigrationContext';

export default function ConnectionsPage() {
  const { authMode, setAuthMode, creds, setCreds, fetchTables } = useMigration();
  const [serverStatus, setServerStatus] = useState<ConnectionsStatus | null>(null);

  // Test state
  const [sfTestStatus, setSfTestStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [sfTestResult, setSfTestResult] = useState<any>(null);

  const [dbxTestStatus, setDbxTestStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [dbxTestResult, setDbxTestResult] = useState<any>(null);

  const loadStatus = async () => {
    try {
      const data = await api.getConnectionsStatus();
      setServerStatus(data);
    } catch (err) {
      console.error('Failed to load connections status', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTestSnowflake = async () => {
    setSfTestStatus('TESTING');
    setSfTestResult(null);
    try {
      const res = await api.testSnowflake(authMode === 'custom' ? creds : null);
      setSfTestStatus('SUCCESS');
      setSfTestResult(res.result);
      fetchTables();
    } catch (err: any) {
      setSfTestStatus('FAILED');
      setSfTestResult({ error: err.message });
    }
  };

  const handleTestDatabricks = async () => {
    setDbxTestStatus('TESTING');
    setDbxTestResult(null);
    try {
      const res = await api.testDatabricks();
      setDbxTestStatus('SUCCESS');
      setDbxTestResult(res.result);
    } catch (err: any) {
      setDbxTestStatus('FAILED');
      setDbxTestResult({ error: err.message });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100">Connection Management</h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure and diagnose endpoints for source (Snowflake) and target (Databricks Unity Catalog).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Snowflake Connection Card */}
        <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e2230]">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold">
                ❄
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Snowflake Source</h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  {serverStatus?.snowflake.configured ? 'Configured in Environment' : 'Requires Credentials'}
                </span>
              </div>
            </div>

            <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-mono ${
              serverStatus?.snowflake.configured
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {serverStatus?.snowflake.configured ? 'READY' : 'UNCONFIGURED'}
            </span>
          </div>

          {/* Auth Mode Toggle */}
          <div className="flex bg-[#0c0e14] p-1 rounded-lg border border-[#252a3a]">
            <button
              onClick={() => setAuthMode('env')}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${
                authMode === 'env'
                  ? 'bg-[#1f2333] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              App Environment (.env)
            </button>
            <button
              onClick={() => setAuthMode('custom')}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${
                authMode === 'custom'
                  ? 'bg-[#1f2333] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Runtime Credentials Form
            </button>
          </div>

          {authMode === 'env' ? (
            <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-3 space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-[#181b24]">
                <span className="text-slate-500">Account:</span>
                <span className="text-slate-200">{serverStatus?.snowflake.account || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181b24]">
                <span className="text-slate-500">User:</span>
                <span className="text-slate-200">{serverStatus?.snowflake.user || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181b24]">
                <span className="text-slate-500">Warehouse:</span>
                <span className="text-slate-200">{serverStatus?.snowflake.warehouse || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181b24]">
                <span className="text-slate-500">Database:</span>
                <span className="text-slate-200">{serverStatus?.snowflake.database || '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Schema:</span>
                <span className="text-slate-200">{serverStatus?.snowflake.schema || '—'}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">User</label>
                  <input
                    type="text"
                    value={creds.snowflake_user}
                    onChange={(e) => setCreds({ ...creds, snowflake_user: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-white font-mono text-xs"
                    placeholder="EGLOBAL1008"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={creds.snowflake_password}
                    onChange={(e) => setCreds({ ...creds, snowflake_password: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-white font-mono text-xs"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Account</label>
                  <input
                    type="text"
                    value={creds.snowflake_account}
                    onChange={(e) => setCreds({ ...creds, snowflake_account: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-white font-mono text-xs"
                    placeholder="EZHXWVO-SM43903"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Warehouse</label>
                  <input
                    type="text"
                    value={creds.snowflake_warehouse}
                    onChange={(e) => setCreds({ ...creds, snowflake_warehouse: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-white font-mono text-xs"
                    placeholder="COMPUTE_WH"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Database</label>
                  <input
                    type="text"
                    value={creds.snowflake_database}
                    onChange={(e) => setCreds({ ...creds, snowflake_database: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-white font-mono text-xs"
                    placeholder="MIGRATION_DB"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Schema</label>
                  <input
                    type="text"
                    value={creds.snowflake_schema}
                    onChange={(e) => setCreds({ ...creds, snowflake_schema: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-white font-mono text-xs"
                    placeholder="SOURCE_DATA"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test Action & Results */}
          <div className="pt-2">
            <button
              onClick={handleTestSnowflake}
              disabled={sfTestStatus === 'TESTING'}
              className="w-full py-2 px-3 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded-lg text-xs font-semibold text-slate-200 transition-all flex items-center justify-center space-x-2"
            >
              {sfTestStatus === 'TESTING' ? (
                <>
                  <span className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                  <span>Pinging Snowflake API...</span>
                </>
              ) : (
                <span>Test Snowflake Connectivity</span>
              )}
            </button>

            {sfTestResult && (
              <div className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
                sfTestStatus === 'SUCCESS'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {sfTestStatus === 'SUCCESS' ? (
                  <div>
                    <div className="font-bold flex items-center space-x-1.5 mb-1">
                      <span>✓</span>
                      <span>Connected in {sfTestResult.latency_ms}ms</span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Version: {sfTestResult.version} • DB: {sfTestResult.database}.{sfTestResult.schema}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-bold mb-1">✕ Connection Failed</div>
                    <div className="text-[11px] text-rose-200">{sfTestResult.error}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Databricks Target Card */}
        <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e2230]">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold">
                ▲
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Databricks Unity Catalog</h3>
                <span className="text-[11px] text-slate-500 font-mono">App Identity / WorkspaceClient</span>
              </div>
            </div>

            <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-mono">
              NATIVE APP
            </span>
          </div>

          <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-3 space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-[#181b24]">
              <span className="text-slate-500">SQL Warehouse ID:</span>
              <span className="text-slate-200">{serverStatus?.databricks.warehouse_id || 'Auto-detected'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#181b24]">
              <span className="text-slate-500">Target Catalog:</span>
              <span className="text-slate-200">{serverStatus?.databricks.catalog}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#181b24]">
              <span className="text-slate-500">Target Schema:</span>
              <span className="text-slate-200">{serverStatus?.databricks.schema}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Staging Volume:</span>
              <span className="text-slate-200 truncate max-w-[200px]" title={serverStatus?.databricks.staging_volume_path}>
                {serverStatus?.databricks.staging_volume_path}
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 space-y-1">
            <div className="font-semibold flex items-center space-x-1.5">
              <span>ℹ</span>
              <span>Platform Service Authentication</span>
            </div>
            <p className="text-[11px] text-blue-200/80 leading-relaxed">
              Databricks access operates through the managed App identity. Storage Volumes and Delta tables are created with Unity Catalog governance.
            </p>
          </div>

          {/* Test Action & Results */}
          <div className="pt-2">
            <button
              onClick={handleTestDatabricks}
              disabled={dbxTestStatus === 'TESTING'}
              className="w-full py-2 px-3 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded-lg text-xs font-semibold text-slate-200 transition-all flex items-center justify-center space-x-2"
            >
              {dbxTestStatus === 'TESTING' ? (
                <>
                  <span className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  <span>Executing Warehouse Ping (SELECT 1)...</span>
                </>
              ) : (
                <span>Test Databricks SQL Warehouse</span>
              )}
            </button>

            {dbxTestResult && (
              <div className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
                dbxTestStatus === 'SUCCESS'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {dbxTestStatus === 'SUCCESS' ? (
                  <div>
                    <div className="font-bold flex items-center space-x-1.5 mb-1">
                      <span>✓</span>
                      <span>Warehouse Responsive ({dbxTestResult.latency_ms}ms)</span>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Warehouse ID: {dbxTestResult.warehouse_id} • Status: {dbxTestResult.state}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="font-bold mb-1">✕ Warehouse Test Failed</div>
                    <div className="text-[11px] text-rose-200">{dbxTestResult.error}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
