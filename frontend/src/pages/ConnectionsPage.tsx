import { useState, useEffect } from 'react';
import { api, type ConnectionsStatus, type ConnectionProfile } from '@/lib/api';
import { useMigration } from '@/contexts/MigrationContext';

export default function ConnectionsPage() {
  const {
    profiles,
    activeProfileId,
    selectProfile,
    saveProfile,
    deleteProfile,
    refreshProfiles,
  } = useMigration();

  const [serverStatus, setServerStatus] = useState<ConnectionsStatus | null>(null);

  // Modal / Form state for Add/Edit profile
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    snowflake_account: '',
    snowflake_user: '',
    snowflake_password: '',
    snowflake_warehouse: '',
    snowflake_database: '',
    snowflake_schema: '',
    snowflake_role: '',
  });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Testing state
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: 'SUCCESS' | 'FAILED'; latency_ms?: number; error?: string; version?: string }>>({});

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

  const openAddModal = () => {
    setEditingProfileId(null);
    setFormData({
      name: '',
      snowflake_account: '',
      snowflake_user: '',
      snowflake_password: '',
      snowflake_warehouse: '',
      snowflake_database: '',
      snowflake_schema: '',
      snowflake_role: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: ConnectionProfile) => {
    setEditingProfileId(p.id);
    setFormData({
      name: p.name,
      snowflake_account: p.snowflake_account,
      snowflake_user: p.snowflake_user,
      snowflake_password: '',
      snowflake_warehouse: p.snowflake_warehouse,
      snowflake_database: p.snowflake_database,
      snowflake_schema: p.snowflake_schema,
      snowflake_role: p.snowflake_role || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      await saveProfile({
        id: editingProfileId || undefined,
        name: formData.name || `${formData.snowflake_database}.${formData.snowflake_schema}`,
        snowflake_account: formData.snowflake_account,
        snowflake_user: formData.snowflake_user,
        snowflake_password: formData.snowflake_password,
        snowflake_warehouse: formData.snowflake_warehouse,
        snowflake_database: formData.snowflake_database,
        snowflake_schema: formData.snowflake_schema,
        snowflake_role: formData.snowflake_role,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save connection profile');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (confirm('Are you sure you want to delete this saved Snowflake connection?')) {
      try {
        await deleteProfile(id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete connection');
      }
    }
  };

  const handleTestProfile = async (id: string) => {
    setTestingProfileId(id);
    try {
      const res = await api.testSavedProfile(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          status: 'SUCCESS',
          latency_ms: res.result.latency_ms,
          version: res.result.version,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          status: 'FAILED',
          error: err.message,
        },
      }));
    } finally {
      setTestingProfileId(null);
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
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2230]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Connection Profiles</h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage, save, and switch between multiple Snowflake source environments and verify Databricks Unity Catalog.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-1.5"
        >
          <span>+ Add Snowflake Connection</span>
        </button>
      </div>

      {/* Saved Snowflake Connection Profiles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Saved Snowflake Sources ({profiles.length})
          </h3>
          <button
            onClick={() => refreshProfiles()}
            className="text-xs text-blue-400 hover:underline font-mono"
          >
            ↻ Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const isTesting = testingProfileId === p.id;
            const testResult = testResults[p.id];

            return (
              <div
                key={p.id}
                className={`bg-[#12151f] border rounded-xl p-5 space-y-3 transition-all relative ${
                  isActive
                    ? 'border-blue-500/50 shadow-lg shadow-blue-500/5 ring-1 ring-blue-500/30'
                    : 'border-[#252a3a] hover:border-[#333a4f]'
                }`}
              >
                {/* Top Title & Status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold text-sm">
                      SF
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-100 font-mono">{p.name}</h4>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {p.snowflake_database}.{p.snowflake_schema}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                        ACTIVE
                      </span>
                    )}
                    {p.is_default && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                        ENV
                      </span>
                    )}
                  </div>
                </div>

                {/* Details list */}
                <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-3 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">ACCOUNT</span>
                    <span className="text-slate-300 truncate block">{p.snowflake_account || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">USER</span>
                    <span className="text-slate-300 truncate block">{p.snowflake_user || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">DATABASE</span>
                    <span className="text-slate-300 truncate block">{p.snowflake_database || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">WAREHOUSE</span>
                    <span className="text-slate-300 truncate block">{p.snowflake_warehouse || '—'}</span>
                  </div>
                </div>

                {/* Test Result Message */}
                {testResult && (
                  <div className={`p-2.5 rounded text-[11px] font-mono border ${
                    testResult.status === 'SUCCESS'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {testResult.status === 'SUCCESS' ? (
                      <span>✓ Connected in {testResult.latency_ms}ms (v{testResult.version})</span>
                    ) : (
                      <span>✕ {testResult.error}</span>
                    )}
                  </div>
                )}

                {/* Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-[#1e2230]">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleTestProfile(p.id)}
                      disabled={isTesting}
                      className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-200 transition-all font-mono"
                    >
                      {isTesting ? 'Testing...' : 'Test'}
                    </button>

                    {!p.is_default && (
                      <button
                        onClick={() => openEditModal(p)}
                        className="px-2.5 py-1 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded text-[11px] text-slate-400 hover:text-slate-200 transition-all font-mono"
                      >
                        Edit
                      </button>
                    )}

                    {!p.is_default && (
                      <button
                        onClick={() => handleDeleteProfile(p.id)}
                        className="px-2 py-1 hover:bg-rose-500/20 text-rose-400 rounded text-[11px] transition-all font-mono"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {!isActive && (
                    <button
                      onClick={() => selectProfile(p.id)}
                      className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded text-[11px] font-semibold transition-all font-mono"
                    >
                      Set Active
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Databricks Target Section */}
      <div className="pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          Target Platform: Databricks Unity Catalog
        </h3>

        <div className="bg-[#12151f] border border-[#252a3a] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e2230]">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold">
                ▲
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200 font-mono">
                  Unity Catalog & SQL Warehouse
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  Managed App Service Principal Identity
                </span>
              </div>
            </div>

            <button
              onClick={handleTestDatabricks}
              disabled={dbxTestStatus === 'TESTING'}
              className="px-3 py-1.5 bg-[#1f2333] hover:bg-[#252a3a] border border-[#252a3a] rounded-lg text-xs font-semibold text-slate-200 transition-all flex items-center space-x-2"
            >
              {dbxTestStatus === 'TESTING' ? (
                <span>Executing SELECT 1...</span>
              ) : (
                <span>Test SQL Warehouse</span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-2.5">
              <span className="text-slate-500 block text-[10px]">SQL WAREHOUSE ID</span>
              <span className="text-slate-200">{serverStatus?.databricks.warehouse_id || 'Auto-detected'}</span>
            </div>
            <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-2.5">
              <span className="text-slate-500 block text-[10px]">TARGET CATALOG</span>
              <span className="text-slate-200">{serverStatus?.databricks.catalog}</span>
            </div>
            <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-2.5">
              <span className="text-slate-500 block text-[10px]">TARGET SCHEMA</span>
              <span className="text-slate-200">{serverStatus?.databricks.schema}</span>
            </div>
            <div className="bg-[#0c0e14] border border-[#1e2230] rounded-lg p-2.5">
              <span className="text-slate-500 block text-[10px]">STAGING VOLUME</span>
              <span className="text-slate-200 truncate block" title={serverStatus?.databricks.staging_volume_path}>
                {serverStatus?.databricks.volume_name}
              </span>
            </div>
          </div>

          {dbxTestResult && (
            <div className={`p-3 rounded-lg border text-xs font-mono ${
              dbxTestStatus === 'SUCCESS'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {dbxTestStatus === 'SUCCESS' ? (
                <div className="flex items-center space-x-2 font-bold">
                  <span>✓</span>
                  <span>Warehouse Responsive in {dbxTestResult.latency_ms}ms (State: {dbxTestResult.state})</span>
                </div>
              ) : (
                <div className="font-bold">✕ {dbxTestResult.error}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add or Edit Connection Profile */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#12151f] border border-[#252a3a] rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-[#1e2230]">
              <h3 className="font-bold text-base text-white">
                {editingProfileId ? 'Edit Snowflake Connection' : 'Add New Snowflake Connection Profile'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 font-mono">
                ✕ {formError}
              </div>
            )}

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Profile Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Production DW / Analytics Sandbox"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Account</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., xy12345.us-east-1"
                    value={formData.snowflake_account}
                    onChange={(e) => setFormData({ ...formData, snowflake_account: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., MIGRATION_USER"
                    value={formData.snowflake_user}
                    onChange={(e) => setFormData({ ...formData, snowflake_user: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Password {editingProfileId ? '(Leave blank to keep current)' : ''}
                  </label>
                  <input
                    type="password"
                    required={!editingProfileId}
                    placeholder="••••••••"
                    value={formData.snowflake_password}
                    onChange={(e) => setFormData({ ...formData, snowflake_password: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Database</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., MIGRATION_DB"
                    value={formData.snowflake_database}
                    onChange={(e) => setFormData({ ...formData, snowflake_database: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Schema</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., TEST_SCHEMA"
                    value={formData.snowflake_schema}
                    onChange={(e) => setFormData({ ...formData, snowflake_schema: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Warehouse</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., COMPUTE_WH"
                    value={formData.snowflake_warehouse}
                    onChange={(e) => setFormData({ ...formData, snowflake_warehouse: e.target.value })}
                    className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Role</label>
                <input
                  type="text"
                  placeholder="e.g., ACCOUNTADMIN"
                  value={formData.snowflake_role}
                  onChange={(e) => setFormData({ ...formData, snowflake_role: e.target.value })}
                  className="w-full bg-[#0c0e14] border border-[#252a3a] rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[#1e2230]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[#1f2333] hover:bg-[#252a3a] text-slate-300 rounded-lg font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs shadow-lg shadow-blue-500/20"
                >
                  {formSaving ? 'Saving...' : 'Save Connection Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
