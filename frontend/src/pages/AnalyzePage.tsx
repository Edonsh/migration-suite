export default function AnalyzePage() {
  return (
    <div className="placeholder-page">
      <span className="placeholder-badge">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M1 8.5 L3.5 5.5 L5 7 L7 3.5 L10 6.5" />
        </svg>
        Step 1 of 3
      </span>
      <h1>Analyze</h1>
      <p>
        Introspect Snowflake schemas, preview table structures, and get conversion
        recommendations before migrating. Feature implementation coming in the next
        sprint.
      </p>
      <div className="placeholder-coming-soon">
        <p>This area will render the schema browser, column-level compatibility analysis, and DDL conversion previews.</p>
      </div>
    </div>
  );
}
