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

export interface ColumnDetail {
  name: string;
  snowflake_type: string;
  databricks_type: string;
  nullable: boolean;
  compatibility: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TableDetails {
  table_name: string;
  row_count: number;
  column_count: number;
  columns: ColumnDetail[];
  sample_rows: Record<string, string>[];
  generated_ddl: string;
  target_table: string;
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
  snowflake_rows: number;
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

export interface ConnectionsStatus {
  snowflake: {
    user: string;
    account: string;
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
  getTables: async (creds?: SnowflakeCredentials | null): Promise<string[]> => {
    if (creds) {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const data = await handleResponse<{ tables: string[] }>(res);
      return data.tables || [];
    } else {
      const res = await fetch('/api/tables');
      const data = await handleResponse<{ tables: string[] }>(res);
      return data.tables || [];
    }
  },

  analyzeTable: async (tableName: string, creds?: SnowflakeCredentials | null): Promise<TableDetails> => {
    const res = await fetch('/api/analyze/table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_name: tableName, creds: creds || null }),
    });
    const data = await handleResponse<{ details: TableDetails }>(res);
    return data.details;
  },

  // Migration Execution
  startMigration: async (selectedTables: string[], creds?: SnowflakeCredentials | null): Promise<{ message: string; job_id: string }> => {
    const res = await fetch('/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_tables: selectedTables, creds: creds || null }),
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
  runValidation: async (tables?: string[], creds?: SnowflakeCredentials | null): Promise<ValidationReport> => {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tables: tables || null, creds: creds || null }),
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
};
