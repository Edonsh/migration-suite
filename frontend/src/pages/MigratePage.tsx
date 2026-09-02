export default function MigratePage() {
  return (
    <div className="placeholder-page">
      <span className="placeholder-badge">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M2 5.5 H9 M7 3 L9 5.5 L7 8" />
        </svg>
        Step 2 of 3
      </span>
      <h1>Migrate</h1>
      <p>
        Select tables, approve the migration plan, and execute the Snowflake →
        Databricks pipeline. Monitor real-time job progress here.
      </p>
      <div className="placeholder-coming-soon">
        <p>This area will render the table selector, execution controls, and live pipeline progress stream.</p>
      </div>
    </div>
  );
}
