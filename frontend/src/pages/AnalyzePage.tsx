import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMigration } from '@/contexts/MigrationContext';
import { api, type DDLGenerationResult, type LakebridgeAssessment, type LakebridgeStatus } from '@/lib/api';

type ObjectType = 'table' | 'view' | 'procedure';

export default function AnalyzePage() {
  const {
    tables,
    views,
    procedures,
    loadingTables,
    tableError,
    fetchObjects,
    activeProfileId,
    activeProfile,
    creds,
    profiles,
    selectProfile,
  } = useMigration();
  const [lakebridgeStatus, setLakebridgeStatus] = useState<LakebridgeStatus | null>(null);
  const [assessment, setAssessment] = useState<LakebridgeAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [objectType, setObjectType] = useState<ObjectType>('table');
  const [selectionOverride, setSelectionOverride] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const [executeInDatabricks, setExecuteInDatabricks] = useState(false);
  const [transpiling, setTranspiling] = useState(false);
  const [transpileError, setTranspileError] = useState<string | null>(null);
  const [results, setResults] = useState<DDLGenerationResult[]>([]);

  const objectPool = useMemo(() => {
    if (objectType === 'view') return views;
    if (objectType === 'procedure') return procedures;
    return tables;
  }, [objectType, procedures, tables, views]);
  const selectedObjects = selectionOverride ?? objectPool;
  const visibleObjects = objectPool.filter((name) => name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    api.getLakebridgeStatus().then(setLakebridgeStatus).catch(() => setLakebridgeStatus(null));
  }, []);

  const handleAssessment = async () => {
    setAssessing(true);
    setAssessmentError(null);
    setAssessment(null);
    try {
      const explicitCreds = activeProfileId ? null : (creds.snowflake_user ? creds : null);
      const result = await api.assessLakebridge(activeProfileId, explicitCreds);
      setAssessment(result);
      if (result.status !== 'SUCCEEDED') {
        setAssessmentError(result.errors?.join('\n') || result.warnings?.join('\n') || `Lakebridge assessment ${result.status.toLowerCase()}.`);
      }
    } catch (error) {
      setAssessmentError(error instanceof Error ? error.message : 'Lakebridge assessment failed.');
    } finally {
      setAssessing(false);
    }
  };

  const handleTranspile = async () => {
    if (selectedObjects.length === 0) return;
    setTranspiling(true);
    setTranspileError(null);
    setResults([]);
    try {
      const explicitCreds = activeProfileId ? null : (creds.snowflake_user ? creds : null);
      const response = await api.generateDDL(
        objectType,
        selectedObjects,
        executeInDatabricks,
        activeProfileId,
        explicitCreds,
      );
      setResults(response.results || []);
    } catch (error) {
      setTranspileError(error instanceof Error ? error.message : 'Lakebridge transpilation failed.');
    } finally {
      setTranspiling(false);
    }
  };

  const toggleObject = (name: string) => {
    setSelectionOverride(selectedObjects.includes(name)
      ? selectedObjects.filter((item) => item !== name)
      : [...selectedObjects, name]);
  };

  const changeObjectType = (type: ObjectType) => {
    setObjectType(type);
    setSelectionOverride(null);
    setResults([]);
    setSearch('');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-[#1e2230] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-sky-400">Lakebridge workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-100">Analyze & transpile</h1>
          <p className="mt-1 text-sm text-slate-400">Lakebridge is the sole engine for source assessment and Snowflake SQL conversion.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profiles.length > 0 && (
            <select
              aria-label="Snowflake connection profile"
              value={activeProfileId || activeProfile?.id || ''}
              onChange={(event) => selectProfile(event.target.value)}
              className="rounded-lg border border-[#252a3a] bg-[#0c0e14] px-3 py-2 text-xs text-slate-200"
            >
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          )}
          <button
            onClick={() => fetchObjects(activeProfileId)}
            disabled={loadingTables}
            className="rounded-lg border border-[#252a3a] bg-[#1f2333] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-[#252a3a] disabled:opacity-50"
          >
            {loadingTables ? 'Discovering…' : 'Refresh objects'}
          </button>
        </div>
      </header>

      {tableError && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{tableError} <Link className="underline" to="/connections">Manage connections</Link></div>}

      <section className="rounded-xl border border-[#252a3a] bg-[#12151f] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">Source assessment</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${lakebridgeStatus?.available ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                {lakebridgeStatus?.available ? `Lakebridge ${lakebridgeStatus.version || 'ready'}` : lakebridgeStatus ? 'Lakebridge unavailable' : 'Checking Lakebridge'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Export Snowflake DDL and run Lakebridge analyze to generate the assessment report.</p>
          </div>
          <button
            onClick={handleAssessment}
            disabled={assessing || !lakebridgeStatus?.available}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-900/20 hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assessing ? 'Running Lakebridge assessment…' : 'Run Lakebridge assessment'}
          </button>
        </div>
        {lakebridgeStatus?.reason && !lakebridgeStatus.available && <p className="mt-3 text-xs text-amber-300">{lakebridgeStatus.reason}</p>}
        {assessmentError && <div className="mt-4 whitespace-pre-wrap rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{assessmentError}</div>}
        {assessment && (
          <div className="mt-4 space-y-3 rounded-lg border border-[#252a3a] bg-[#0c0e14] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-200">Assessment {assessment.status}</span>
              {assessment.output_location && <span className="font-mono text-slate-400">Report: {assessment.output_location}</span>}
            </div>
            {assessment.warnings?.length > 0 && <p className="text-xs text-amber-300">{assessment.warnings.join(' · ')}</p>}
            <details>
              <summary className="cursor-pointer text-xs text-sky-300">Lakebridge assessment output</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-3 text-[11px] text-slate-300">{JSON.stringify(assessment.raw, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4 rounded-xl border border-[#252a3a] bg-[#12151f] p-5">
          <div>
            <h2 className="text-base font-bold text-slate-100">SQL transpilation</h2>
            <p className="mt-1 text-xs text-slate-400">Select Snowflake objects and ask Lakebridge to generate Databricks SQL.</p>
            <p className="mt-1 text-[11px] text-slate-500">Selected objects are grouped into one Lakebridge batch.</p>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#252a3a] bg-[#0c0e14] p-1">
            {(['table', 'view', 'procedure'] as ObjectType[]).map((type) => (
              <button
                key={type}
                onClick={() => changeObjectType(type)}
                className={`rounded-md px-2 py-2 text-xs font-semibold capitalize ${objectType === type ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >{type}s</button>
            ))}
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Filter ${objectType}s…`}
            className="w-full rounded-lg border border-[#252a3a] bg-[#0c0e14] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500"
          />
          <div className="flex justify-between text-[11px]">
            <button onClick={() => setSelectionOverride(null)} className="text-sky-400 hover:underline">Select all ({objectPool.length})</button>
            <button onClick={() => setSelectionOverride([])} className="text-slate-400 hover:underline">Clear selection</button>
            <span className="text-slate-500">{selectedObjects.length} selected</span>
          </div>
          <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-[#1e2230] p-2">
            {loadingTables ? <p className="p-3 text-xs text-slate-500">Loading source objects…</p> : visibleObjects.length === 0 ? <p className="p-3 text-xs text-slate-500">No {objectType}s found.</p> : visibleObjects.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                <input type="checkbox" checked={selectedObjects.includes(name)} onChange={() => toggleObject(name)} />
                <span className="truncate font-mono">{name}</span>
              </label>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={executeInDatabricks} onChange={(event) => setExecuteInDatabricks(event.target.checked)} className="mt-0.5" />
            <span>Deploy Lakebridge output to Databricks after transpilation</span>
          </label>
          <button
            onClick={handleTranspile}
            disabled={transpiling || selectedObjects.length === 0 || !lakebridgeStatus?.available}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {transpiling ? 'Transpiling with Lakebridge…' : `Transpile ${selectedObjects.length || ''} selected object${selectedObjects.length === 1 ? '' : 's'}`}
          </button>
          {transpileError && <p className="whitespace-pre-wrap text-xs text-rose-300">{transpileError}</p>}
        </div>

        <div className="space-y-4 rounded-xl border border-[#252a3a] bg-[#12151f] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-100">Lakebridge results</h2>
              <p className="mt-1 text-xs text-slate-400">{activeProfile ? `${activeProfile.snowflake_database}.${activeProfile.snowflake_schema}` : 'Selected Snowflake source'}</p>
            </div>
            {results.length > 0 && <span className="text-xs text-slate-500">{results.length} result(s)</span>}
          </div>
          {results.length === 0 ? (
            <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-[#2a3040] text-center text-xs text-slate-500">Transpilation results will appear here.</div>
          ) : results.map((result) => (
            <article key={`${result.object_type}:${result.object_name}`} className="overflow-hidden rounded-lg border border-[#252a3a] bg-[#0c0e14]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252a3a] px-4 py-3">
                <span className="font-mono text-xs font-bold text-slate-200">{result.object_name} <span className="font-sans font-normal capitalize text-slate-500">· {result.object_type}</span></span>
                <span className={`rounded border px-2 py-0.5 text-[10px] ${result.lakebridge_used ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>{result.lakebridge_used ? 'Lakebridge transpiled' : 'Transpile failed'}</span>
              </div>
              {result.error && <p className="px-4 pt-3 text-xs text-rose-300">{result.error}</p>}
              {result.execution_result && <p className="px-4 pt-3 text-xs text-slate-300">Deployment: {result.execution_result.status} ({result.execution_result.state}){result.execution_result.error ? ` · ${result.execution_result.error}` : ''}</p>}
              {result.generated_ddl && <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-3 text-[11px] leading-relaxed text-sky-200">{result.generated_ddl}</pre>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
