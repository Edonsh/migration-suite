/**
 * API client and types for Snowflake -> Databricks Migration Suite
 */

export interface SnowflakeCredentials {
  snowflake_user: string;
  snowflake_password: string;
  snowflake_account: string;
  snowflake_warehouse: string;
  snowflake_database: string;
  snowflake_schema: string;
  snowflake_role?: string;
}

export interface DiscoveredObjects {
  database: string;
  tables: string[];
  views: string[];
  procedures: string[];
}

export interface TableProgress {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  stage: string;
  rows: number;
  duration_seconds: number;
}

export interface MigrationLog {
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface MigrationStatusResponse {
  job_id: string | null;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | string;
  progress: number;
  stage: string;
  tables_total: number;
  tables_completed: number;
  tables_failed: number;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number;
  selected_tables?: string[];
  table_progress: Record<string, TableProgress>;
  logs: MigrationLog[];
}

export interface ValidationTableResult {
  table_name: string;
  target_table: string;
  source_rows: number;
  databricks_rows: number;
  difference: number;
  status: 'PASSED' | 'FAILED';
  match_percentage: number;
  error?: string;
}

export interface ValidationReport {
  status: 'PASSED' | 'FAILED';
  overall_match_rate: number;
  total_tables: number;
  passed_tables: number;
  failed_tables: number;
  total_source_rows: number;
  total_target_rows: number;
  total_difference: number;
  tables: ValidationTableResult[];
}

export interface ConnectionProfile {
  id: string;
  name: string;
  snowflake_user: string;
  snowflake_password?: string;
  snowflake_account: string;
  snowflake_warehouse: string;
  snowflake_database: string;
  snowflake_schema: string;
  snowflake_role?: string;
  is_default?: boolean;
  has_password?: boolean;
  created_at?: string;
}

export interface DDLGenerationResult {
  object_name: string;
  object_type: string;
  snowflake_ddl: string;
  generated_ddl: string;
  lakebridge_used: boolean;
  execution_result: {
    status: 'SUCCEEDED' | 'FAILED';
    state: string;
    error?: string | null;
  } | null;
  error: string | null;
}

export interface LakebridgeStatus {
  enabled: boolean;
  available: boolean;
  version?: string | null;
  reason?: string | null;
}

export interface LakebridgeAssessment {
  source_object: string;
  object_type: string;
  status: string;
  lakebridge_used: boolean;
  warnings: string[];
  errors: string[];
  output_location?: string | null;
  raw: Record<string, unknown>;
}

export interface ConnectionsStatus {
  snowflake: {
    account: string;
    user: string;
    warehouse: string;
    database: string;
    schema: string;
    role: string;
    configured: boolean;
  };
  databricks: {
    warehouse_id: string;
    catalog: string;
    schema: string;
    volume_name: string;
    staging_volume_path: string;
    configured: boolean;
  };
  environment: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      errorDetail = data.detail || errorDetail;
    } catch {
      // noop
    }
    throw new Error(errorDetail);
  }
  return (await res.json()) as T;
}

export const api = {
  // Discovery & Analysis
  getObjects: async (profileId?: string | null, creds?: SnowflakeCredentials | null): Promise<DiscoveredObjects> => {
    if (creds && creds.snowflake_user) {
      const res = await fetch('/api/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creds }),
      });
      return handleResponse<DiscoveredObjects>(res);
    } else {
      const url = profileId ? `/api/objects?profile_id=${encodeURIComponent(profileId)}` : '/api/objects';
      const res = await fetch(url);
      return handleResponse<DiscoveredObjects>(res);
    }
  },

  getLakebridgeStatus: async (): Promise<LakebridgeStatus> => {
    const res = await fetch('/api/lakebridge/status');
    return handleResponse<LakebridgeStatus>(res);
  },

  assessLakebridge: async (profileId?: string | null, creds?: SnowflakeCredentials | null): Promise<LakebridgeAssessment> => {
    const res = await fetch('/api/lakebridge/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId || null, creds: creds || null }),
    });
    const data = await handleResponse<{ result: LakebridgeAssessment }>(res);
    return data.result;
  },

  // DDL Generation
  generateDDL: async (
    objectType: 'table' | 'view' | 'procedure',
    objectNames: string[],
    executeInDatabricks: boolean,
    profileId?: string | null,
    creds?: SnowflakeCredentials | null
  ): Promise<{ results: DDLGenerationResult[] }> => {
    const res = await fetch('/api/generate-ddl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object_type: objectType,
        object_names: objectNames,
        execute_in_databricks: executeInDatabricks,
        profile_id: profileId || null,
        creds: creds || null,
      }),
    });
    return handleResponse<{ results: DDLGenerationResult[] }>(res);
  },

  // Migration Execution
  startMigration: async (selectedTables: string[], profileId?: string | null, creds?: SnowflakeCredentials | null): Promise<{ message: string; job_id: string }> => {
    const res = await fetch('/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_tables: selectedTables, profile_id: profileId || null, creds: creds || null }),
    });
    return handleResponse<{ message: string; job_id: string }>(res);
  },

  getStatus: async (): Promise<MigrationStatusResponse> => {
    const res = await fetch('/api/status');
    return handleResponse<MigrationStatusResponse>(res);
  },

  getHistory: async (): Promise<MigrationStatusResponse[]> => {
    const res = await fetch('/api/migrations/history');
    const data = await handleResponse<{ history: MigrationStatusResponse[] }>(res);
    return data.history || [];
  },

  // Validation
  runValidation: async (tables?: string[], profileId?: string | null, creds?: SnowflakeCredentials | null): Promise<ValidationReport> => {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tables: tables || null, profile_id: profileId || null, creds: creds || null }),
    });
    const data = await handleResponse<{ report: ValidationReport }>(res);
    return data.report;
  },

  // Connections
  getConnectionsStatus: async (): Promise<ConnectionsStatus> => {
    const res = await fetch('/api/connections/status');
    return handleResponse<ConnectionsStatus>(res);
  },

  testSnowflake: async (creds?: SnowflakeCredentials | null): Promise<any> => {
    const res = await fetch('/api/connections/test-snowflake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds || null),
    });
    return handleResponse<any>(res);
  },

  testDatabricks: async (creds?: SnowflakeCredentials | null): Promise<any> => {
    const res = await fetch('/api/connections/test-databricks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds || null),
    });
    return handleResponse<any>(res);
  },

  // Saved Connection Profiles
  getProfiles: async (): Promise<ConnectionProfile[]> => {
    const res = await fetch('/api/connections/profiles');
    const data = await handleResponse<{ profiles: ConnectionProfile[] }>(res);
    return data.profiles || [];
  },

  saveProfile: async (profile: Partial<ConnectionProfile>): Promise<ConnectionProfile> => {
    const res = await fetch('/api/connections/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    const data = await handleResponse<{ profile: ConnectionProfile }>(res);
    return data.profile;
  },

  deleteProfile: async (profileId: string): Promise<void> => {
    const res = await fetch(`/api/connections/profiles/${profileId}`, {
      method: 'DELETE',
    });
    await handleResponse<any>(res);
  },

  testSavedProfile: async (profileId: string): Promise<any> => {
    const res = await fetch(`/api/connections/profiles/${profileId}/test`, {
      method: 'POST',
    });
    return handleResponse<any>(res);
  },
};
