export default function MigrationsPage() {
  return (
    <div className="placeholder-page">
      <span className="placeholder-badge">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <rect x="0.5" y="2" width="10" height="7" rx="1" />
          <path d="M0.5 4.5 H10.5" />
        </svg>
        History
      </span>
      <h1>Migrations</h1>
      <p>
        Browse past and in-progress migration jobs, view per-table status, and
        re-run or inspect individual pipelines.
      </p>
      <div className="placeholder-coming-soon">
        <p>This area will render the migration job list with status badges, timestamps, and drill-down detail views.</p>
      </div>
    </div>
  );
}
