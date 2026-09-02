import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, type SnowflakeCredentials, type MigrationStatusResponse } from '@/lib/api';

interface MigrationContextType {
  tables: string[];
  selectedTables: string[];
  loadingTables: boolean;
  tableError: string | null;
  authMode: 'env' | 'custom';
  creds: SnowflakeCredentials;
  status: MigrationStatusResponse | null;
  history: MigrationStatusResponse[];
  setAuthMode: (mode: 'env' | 'custom') => void;
  setCreds: React.Dispatch<React.SetStateAction<SnowflakeCredentials>>;
  setSelectedTables: React.Dispatch<React.SetStateAction<string[]>>;
  toggleTable: (table: string) => void;
  selectAllTables: () => void;
  clearSelectedTables: () => void;
  fetchTables: () => Promise<void>;
  fetchHistory: () => Promise<void>;
}

const defaultCreds: SnowflakeCredentials = {
  snowflake_user: '',
  snowflake_password: '',
  snowflake_account: '',
  snowflake_warehouse: '',
  snowflake_database: '',
  snowflake_schema: '',
  snowflake_role: '',
};

const MigrationContext = createContext<MigrationContextType | null>(null);

export function MigrationProvider({ children }: { children: ReactNode }) {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'env' | 'custom'>('env');
  const [creds, setCreds] = useState<SnowflakeCredentials>(defaultCreds);
  const [status, setStatus] = useState<MigrationStatusResponse | null>(null);
  const [history, setHistory] = useState<MigrationStatusResponse[]>([]);

  const fetchTables = async () => {
    setLoadingTables(true);
    setTableError(null);
    try {
      const result = await api.getTables(authMode === 'custom' ? creds : null);
      setTables(result);
      if (result.length > 0 && selectedTables.length === 0) {
        setSelectedTables(result);
      }
    } catch (err: any) {
      setTableError(err.message || 'Failed to discover tables');
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const runs = await api.getHistory();
      setHistory(runs);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  const toggleTable = (table: string) => {
    setSelectedTables((prev) =>
      prev.includes(table) ? prev.filter((t) => t !== table) : [...prev, table]
    );
  };

  const selectAllTables = () => {
    setSelectedTables(tables);
  };

  const clearSelectedTables = () => {
    setSelectedTables([]);
  };

  // Initial table fetch on mount
  useEffect(() => {
    fetchTables();
    fetchHistory();
  }, [authMode]);

  // Status Polling when migration is RUNNING
  useEffect(() => {
    let interval: any = null;
    const checkStatus = async () => {
      try {
        const s = await api.getStatus();
        setStatus(s);
        if (s.status === 'COMPLETED' || s.status.startsWith('FAILED')) {
          fetchHistory();
        }
      } catch (err) {
        console.error('Status poll error', err);
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MigrationContext.Provider
      value={{
        tables,
        selectedTables,
        loadingTables,
        tableError,
        authMode,
        creds,
        status,
        history,
        setAuthMode,
        setCreds,
        setSelectedTables,
        toggleTable,
        selectAllTables,
        clearSelectedTables,
        fetchTables,
        fetchHistory,
      }}
    >
      {children}
    </MigrationContext.Provider>
  );
}

export function useMigration() {
  const ctx = useContext(MigrationContext);
  if (!ctx) {
    throw new Error('useMigration must be used within a MigrationProvider');
  }
  return ctx;
}
