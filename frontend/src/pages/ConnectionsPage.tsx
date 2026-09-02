export default function ConnectionsPage() {
  return (
    <div className="placeholder-page">
      <span className="placeholder-badge">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="3" cy="5.5" r="1.5" />
          <circle cx="8" cy="5.5" r="1.5" />
          <path d="M4.5 5.5 H6.5" />
        </svg>
        Settings
      </span>
      <h1>Connections</h1>
      <p>
        Manage and validate connectivity to Snowflake, Databricks Unity Catalog,
        and cloud staging object storage (AWS S3 / Azure ADLS / GCS).
      </p>
      <div className="placeholder-coming-soon">
        <p>This area will render connection profiles, credential testing tools, and permission diagnostics.</p>
      </div>
    </div>
  );
}
