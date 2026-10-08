import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, type SnowflakeCredentials, type MigrationStatusResponse, type ConnectionProfile } from '@/lib/api';

interface MigrationContextType {
  tables: string[];
  views: string[];
  procedures: string[];
  selectedTables: string[];
  loadingTables: boolean;
  tableError: string | null;
  creds: SnowflakeCredentials;
  status: MigrationStatusResponse | null;
  history: MigrationStatusResponse[];
  profiles: ConnectionProfile[];
  activeProfileId: string | null;
  activeProfile: ConnectionProfile | null;
  setCreds: React.Dispatch<React.SetStateAction<SnowflakeCredentials>>;
  setSelectedTables: React.Dispatch<React.SetStateAction<string[]>>;
  toggleTable: (table: string) => void;
  selectAllTables: () => void;
  clearSelectedTables: () => void;
  fetchTables: (targetProfileId?: string | null) => Promise<void>;
  fetchObjects: (targetProfileId?: string | null) => Promise<void>;
  fetchHistory: () => Promise<void>;
  refreshProfiles: () => Promise<ConnectionProfile[]>;
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
  const [views, setViews] = useState<string[]>([]);
  const [procedures, setProcedures] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [creds, setCreds] = useState<SnowflakeCredentials>(defaultCreds);
  const [status, setStatus] = useState<MigrationStatusResponse | null>(null);
  const [history, setHistory] = useState<MigrationStatusResponse[]>([]);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    return localStorage.getItem('active_snowflake_profile_id');
  });

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || (profiles.length > 0 ? profiles[0] : null);

  const refreshProfiles = async (): Promise<ConnectionProfile[]> => {
    try {
      const list = (await api.getProfiles()).filter((profile) =>
        profile.snowflake_user && profile.snowflake_account && profile.snowflake_database && profile.snowflake_schema,
      );
      setProfiles(list);
      if (list.length > 0) {
        if (!activeProfileId || !list.some((p) => p.id === activeProfileId)) {
          const firstId = list[0].id;
          setActiveProfileId(firstId);
          localStorage.setItem('active_snowflake_profile_id', firstId);
        }
      } else {
        setActiveProfileId(null);
        localStorage.removeItem('active_snowflake_profile_id');
      }
      return list;
    } catch (err) {
      console.error('Failed to load connection profiles', err);
      return [];
    }
  };

  const selectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    localStorage.setItem('active_snowflake_profile_id', profileId);
    const target = profiles.find((p) => p.id === profileId);
    if (target) {
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
  };

  const saveProfile = async (profileData: Partial<ConnectionProfile>) => {
    const saved = await api.saveProfile(profileData);
    await refreshProfiles();
    selectProfile(saved.id);
    return saved;
  };

  const deleteProfile = async (profileId: string) => {
    await api.deleteProfile(profileId);
    const list = await refreshProfiles();
    if (activeProfileId === profileId && list.length > 0) {
      selectProfile(list[0].id);
    }
  };

  const fetchObjects = async (targetProfileId?: string | null) => {
    const pid = targetProfileId !== undefined ? targetProfileId : (activeProfile?.id || activeProfileId);
    if (!pid && (!creds || !creds.snowflake_user)) {
      setTables([]);
      setViews([]);
      setProcedures([]);
      return;
    }
    setLoadingTables(true);
    setTableError(null);
    try {
      const result = await api.getObjects(pid, pid ? null : (creds.snowflake_user ? creds : null));
      setTables(result.tables || []);
      setViews(result.views || []);
      setProcedures(result.procedures || []);
      if (result.tables && result.tables.length > 0) {
        setSelectedTables(result.tables);
      } else {
        setSelectedTables([]);
      }
    } catch (err: any) {
      setTableError(err.message || 'Failed to discover objects for selected connection');
      setTables([]);
      setViews([]);
      setProcedures([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchTables = async (targetProfileId?: string | null) => {
    return fetchObjects(targetProfileId);
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
    refreshProfiles().then((list) => {
      if (list.length > 0) {
        const currentId = localStorage.getItem('active_snowflake_profile_id') || list[0].id;
        fetchObjects(currentId);
      }
    });
    fetchHistory();
  }, []);

  // Fetch objects when active profile changes
  useEffect(() => {
    if (activeProfileId) {
      fetchObjects(activeProfileId);
    }
  }, [activeProfileId]);

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
        views,
        procedures,
        selectedTables,
        loadingTables,
        tableError,
        creds,
        status,
        history,
        profiles,
        activeProfileId,
        activeProfile,
        setCreds,
        setSelectedTables,
        toggleTable,
        selectAllTables,
        clearSelectedTables,
        fetchTables,
        fetchObjects,
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
