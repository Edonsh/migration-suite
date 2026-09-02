import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, type SnowflakeCredentials, type MigrationStatusResponse, type ConnectionProfile } from '@/lib/api';

interface MigrationContextType {
  tables: string[];
  selectedTables: string[];
  loadingTables: boolean;
  tableError: string | null;
  authMode: 'env' | 'custom';
  creds: SnowflakeCredentials;
  status: MigrationStatusResponse | null;
  history: MigrationStatusResponse[];
  profiles: ConnectionProfile[];
  activeProfileId: string;
  activeProfile: ConnectionProfile | null;
  setAuthMode: (mode: 'env' | 'custom') => void;
  setCreds: React.Dispatch<React.SetStateAction<SnowflakeCredentials>>;
  setSelectedTables: React.Dispatch<React.SetStateAction<string[]>>;
  toggleTable: (table: string) => void;
  selectAllTables: () => void;
  clearSelectedTables: () => void;
  fetchTables: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  selectProfile: (profileId: string) => void;
  saveProfile: (profile: Partial<ConnectionProfile>) => Promise<ConnectionProfile>;
  deleteProfile: (profileId: string) => Promise<void>;
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
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default_env');

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  const refreshProfiles = async () => {
    try {
      const list = await api.getProfiles();
      setProfiles(list);
      if (list.length > 0 && !list.some((p) => p.id === activeProfileId)) {
        setActiveProfileId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load profiles', err);
    }
  };

  const selectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    const target = profiles.find((p) => p.id === profileId);
    if (target) {
      if (target.id === 'default_env') {
        setAuthMode('env');
      } else {
        setAuthMode('custom');
        setCreds({
          snowflake_user: target.snowflake_user,
          snowflake_password: target.snowflake_password || '',
          snowflake_account: target.snowflake_account,
          snowflake_warehouse: target.snowflake_warehouse,
          snowflake_database: target.snowflake_database,
          snowflake_schema: target.snowflake_schema,
          snowflake_role: target.snowflake_role || '',
        });
      }
    }
  };

  const saveProfile = async (profileData: Partial<ConnectionProfile>) => {
    const saved = await api.saveProfile(profileData);
    await refreshProfiles();
    selectProfile(saved.id);
    return saved;
  };

  const deleteProfile = async (profileId: string) => {
    await api.deleteProfile(profileId);
    await refreshProfiles();
    if (activeProfileId === profileId) {
      selectProfile('default_env');
    }
  };

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

  // Initial load
  useEffect(() => {
    refreshProfiles();
    fetchHistory();
  }, []);

  // Fetch tables when active connection changes
  useEffect(() => {
    fetchTables();
  }, [authMode, creds.snowflake_account, creds.snowflake_database, creds.snowflake_schema]);

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
        profiles,
        activeProfileId,
        activeProfile,
        setAuthMode,
        setCreds,
        setSelectedTables,
        toggleTable,
        selectAllTables,
        clearSelectedTables,
        fetchTables,
        fetchHistory,
        refreshProfiles,
        selectProfile,
        saveProfile,
        deleteProfile,
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
