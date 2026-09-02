import { useState, useEffect } from 'react';

const api = (path: string) => path;

export default function App() {
  const [step, setStep] = useState(1);
  
  // Toggle between 'env' (local config) and 'custom' (form input)
  const [authMode, setAuthMode] = useState<'env' | 'custom'>('env');

  // Credential State
  const [creds, setCreds] = useState({
    snowflake_user: '',
    snowflake_password: '',
    snowflake_account: '',
    snowflake_warehouse: '',
    snowflake_database: '',
    snowflake_schema: '',
    snowflake_role: ''
  });

  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<any>({ status: 'IDLE' });
  const [loading, setLoading] = useState(false);

  const handleCredChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreds({ ...creds, [e.target.name]: e.target.value });
  };

  // Step 1 -> Step 2: Connect based on selected mode
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = authMode === 'env' ? api('/api/tables') : api('/api/connect');
      const options: RequestInit = authMode === 'custom' ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      } : { method: 'GET' };

      const res = await fetch(endpoint, options);
      const data = await res.json();
      
      if (res.ok) {
        setTables(data.tables || []);
        setStep(2);
      } else {
        alert(data.detail || "Authentication failed. Check your inputs.");
      }
    } catch (err) {
      console.error("Failed to connect", err);
      alert("Network error. Ensure the FastAPI backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const toggleTable = (table: string) => {
    setSelected(prev => 
      prev.includes(table) ? prev.filter(t => t !== table) : [...prev, table]
    );
  };

  const startMigration = async () => {
    if (selected.length === 0) return;
    setStep(3);
    try {
      const res = await fetch(api('/api/migrate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_tables: selected,
          creds: authMode === 'custom' ? creds : null
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ status: 'RUNNING', message: data.message });
      } else {
        setStatus({ status: `FAILED: ${data.detail || 'Unknown error'}` });
      }
    } catch (err) {
      setStatus({ status: 'FAILED: Network error' });
    }
  };

  useEffect(() => {
    let interval: any;
    if (step === 3) {
      interval = setInterval(() => {
        fetch(api('/api/status'))
          .then(res => res.json())
          .then(data => {
            setStatus(data);
            if (data.status === 'COMPLETED' || data.status.startsWith('FAILED')) {
              setStep(4);
            }
          })
          .catch(err => console.error("Polling error", err));
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [step]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans flex flex-col justify-between">
      <div className="max-w-3xl mx-auto w-full">
        <header className="mb-8 border-b border-slate-800 pb-4 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Snowflake ➔ Databricks Migration Suite
          </h1>
          <p className="text-slate-400 mt-1">v2.0 Web Control Center</p>
          
          <div className="flex justify-center items-center space-x-4 mt-6 text-xs font-semibold">
            <span className={`px-3 py-1 rounded-full ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1. Connection Mode</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-3 py-1 rounded-full ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2. Select Tables</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-3 py-1 rounded-full ${step === 3 ? 'bg-amber-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>3. Execution</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-3 py-1 rounded-full ${step === 4 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>4. Report</span>
          </div>
        </header>

        {/* STEP 1: Mode Selection & Credentials Form */}
        {step === 1 && (
          <form onSubmit={handleConnect} className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 shadow-xl space-y-6">
            <h2 className="text-xl font-semibold text-slate-200">Choose Connection Approach</h2>
            
            {/* Radio Button Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={`flex items-start space-x-3 p-4 rounded-xl border cursor-pointer transition-all ${authMode === 'env' ? 'bg-blue-600/10 border-blue-500 text-white' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50'}`}>
                <input type="radio" name="authMode" checked={authMode === 'env'} onChange={() => setAuthMode('env')} className="mt-1 text-blue-500 focus:ring-blue-500" />
                <div>
                  <span className="block font-medium text-slate-200">Use App Environment</span>
                  <span className="block text-xs text-slate-400 mt-0.5">Use Snowflake values configured as Databricks App environment variables.</span>
                </div>
              </label>

              <label className={`flex items-start space-x-3 p-4 rounded-xl border cursor-pointer transition-all ${authMode === 'custom' ? 'bg-blue-600/10 border-blue-500 text-white' : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50'}`}>
                <input type="radio" name="authMode" checked={authMode === 'custom'} onChange={() => setAuthMode('custom')} className="mt-1 text-blue-500 focus:ring-blue-500" />
                <div>
                  <span className="block font-medium text-slate-200">Custom Credentials Form</span>
                  <span className="block text-xs text-slate-400 mt-0.5">Enter runtime credentials dynamically for multi-tenant or scalable usage.</span>
                </div>
              </label>
            </div>

            {/* Conditional Fields: Only show input form if 'custom' is chosen */}
            {authMode === 'custom' && (
              <div className="space-y-4 pt-4 border-t border-slate-700/60 animate-fadeIn">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400">Enter Target Credentials</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Snowflake User</label>
                    <input type="text" name="snowflake_user" value={creds.snowflake_user} onChange={handleCredChange} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="e.g., JDOE" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Snowflake Password</label>
                    <input type="password" name="snowflake_password" value={creds.snowflake_password} onChange={handleCredChange} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Snowflake Account</label>
                    <input type="text" name="snowflake_account" value={creds.snowflake_account} onChange={handleCredChange} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="e.g., xy12345" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Warehouse</label>
                    <input type="text" name="snowflake_warehouse" value={creds.snowflake_warehouse} onChange={handleCredChange} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="e.g., COMPUTE_WH" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Database</label>
                    <input type="text" name="snowflake_database" value={creds.snowflake_database} onChange={handleCredChange} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="e.g., RAW_DB" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Schema</label>
                    <input type="text" name="snowflake_schema" value={creds.snowflake_schema} onChange={handleCredChange} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="e.g., PUBLIC" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Role</label>
                    <input type="text" name="snowflake_role" value={creds.snowflake_role} onChange={handleCredChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="Optional" />
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Databricks access is provided by the deployed app identity.
                </p>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-500/20">
              {loading ? 'Connecting & Discovering Tables...' : 'Continue to Table Selection'}
            </button>
          </form>
        )}

        {/* STEP 2: Table Selection */}
        {step === 2 && (
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-slate-200">Select Tables to Migrate</h2>
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/30">
                {selected.length} selected
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-2 mb-6">
              {tables.map(table => (
                <label key={table} className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-all border ${selected.includes(table) ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-800/80'}`}>
                  <input type="checkbox" checked={selected.includes(table)} onChange={() => toggleTable(table)} className="rounded border-slate-700 text-blue-500 w-4 h-4" />
                  <span className="font-mono text-sm">{table}</span>
                </label>
              ))}
            </div>

            <div className="flex space-x-4">
              <button onClick={() => setStep(1)} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium">Back</button>
              <button onClick={startMigration} disabled={selected.length === 0} className={`flex-1 py-3 rounded-lg font-medium text-white shadow-lg ${selected.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/25'}`}>
                Start Pipeline Execution
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Execution / Progress */}
        {step === 3 && (
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-8 shadow-xl text-center space-y-6">
            <div className="inline-block p-4 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-bounce">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Migration Pipeline Running</h2>
              <p className="text-slate-400 text-sm mt-1">Extracting Parquet, staging to Unity Catalog, and executing COPY INTO...</p>
            </div>
            <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 inline-block px-6">
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Status</span>
              <span className="text-amber-400 font-mono font-bold">{status.status}</span>
            </div>
          </div>
        )}

        {/* STEP 4: Final Report Dashboard */}
        {step === 4 && (
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 shadow-xl space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-700 pb-4">
              <div className={`p-2 rounded-full ${status.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Migration Summary Report</h2>
                <p className="text-xs text-slate-400">Execution completed with status: <span className="font-mono text-slate-200">{status.status}</span></p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Processed Tables ({selected.length})</h3>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                {selected.map(t => (
                  <div key={t} className="flex justify-between items-center text-sm font-mono border-b border-slate-800/60 pb-2">
                    <span className="text-slate-300">{t}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${status.status === 'COMPLETED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'}`}>
                      {status.status === 'COMPLETED' ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => { setStep(1); setSelected([]); setStatus({ status: 'IDLE' }); }} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg">
              Run Another Migration
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
