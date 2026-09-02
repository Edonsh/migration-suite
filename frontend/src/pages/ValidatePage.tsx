export default function ValidatePage() {
  return (
    <div className="placeholder-page">
      <span className="placeholder-badge">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M5.5 1.5 L9.5 3.5 L9.5 7 C9.5 9 7.5 10 5.5 10.5 C3.5 10 1.5 9 1.5 7 L1.5 3.5 Z" />
          <path d="M3.5 5.5 L4.8 7 L7.5 4" />
        </svg>
        Step 3 of 3
      </span>
      <h1>Validate</h1>
      <p>
        Run row-count reconciliation, schema diff, and data-quality checks against the
        migrated tables in Unity Catalog to confirm the migration is correct.
      </p>
      <div className="placeholder-coming-soon">
        <p>This area will render the reconciliation report, diff viewer, and quality check results per table.</p>
      </div>
    </div>
  );
}
