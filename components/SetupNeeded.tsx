/**
 * Shown instead of a stack trace when the database is not reachable yet.
 * A freshly deployed instance has no DATABASE_URL, and a page that explains
 * itself is worth more than a 500.
 */
export function SetupNeeded({ detail }: { detail?: string }) {
  const configured = !!process.env.DATABASE_URL;
  return (
    <main className="min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-lg">
        <h1 className="text-xl font-semibold tracking-tight">Aangan Leads is deployed, but has no database yet</h1>
        <p className="mt-2 text-sm text-ink-2 leading-relaxed">
          {configured
            ? 'DATABASE_URL is set, but the database could not be reached or the tables are missing.'
            : 'DATABASE_URL is not set, so there is nowhere to read leads from.'}
        </p>

        <ol className="mt-5 space-y-4 text-sm">
          <li className="card p-4">
            <p className="font-medium">1. Create a Neon database</p>
            <p className="text-ink-2 mt-1">
              Copy the <b>pooled</b> connection string — the host with <code className="text-xs">-pooler</code> in it.
            </p>
          </li>
          <li className="card p-4">
            <p className="font-medium">2. Set it on the project</p>
            <pre className="mt-2 text-xs bg-surface-2 rounded-card p-3 overflow-x-auto">DATABASE_URL=postgresql://…-pooler….neon.tech/aangan?sslmode=require</pre>
          </li>
          <li className="card p-4">
            <p className="font-medium">3. Create the tables and seed the demo</p>
            <pre className="mt-2 text-xs bg-surface-2 rounded-card p-3 overflow-x-auto">npm run db:migrate{'\n'}npm run db:seed</pre>
          </li>
        </ol>

        {detail && (
          <details className="mt-5">
            <summary className="text-xs text-ink-3 cursor-pointer">What went wrong</summary>
            <pre className="mt-2 text-[11px] text-ink-2 bg-surface-2 rounded-card p-3 overflow-x-auto whitespace-pre-wrap">{detail}</pre>
          </details>
        )}
      </div>
    </main>
  );
}
