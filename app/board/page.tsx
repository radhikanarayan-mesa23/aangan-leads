import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { listLeads, listUsers } from '@/lib/leads';
import { toBoardLead } from '@/lib/view';
import { Board } from '@/components/Board';
import { Chrome } from '@/components/Chrome';
import { SetupNeeded } from '@/components/SetupNeeded';

export const dynamic = 'force-dynamic';

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const sp = await searchParams;

  let rows, users;
  try {
    [rows, users] = await Promise.all([listLeads(), listUsers()]);
  } catch (e) {
    return <SetupNeeded detail={String(e)} />;
  }
  const names = Object.fromEntries(users.map((u) => [u.email, u.name]));
  const leads = rows.map((r) => toBoardLead(r, names));

  return (
    <Chrome user={user} active="board">
      {sp.denied === 'owner' && (
        <p className="mb-4 card p-3 text-sm text-ink-2">The overview is Nikhil's. You have the board.</p>
      )}
      <Board leads={leads} users={users} me={user} openLeadId={sp.lead} />
    </Chrome>
  );
}
