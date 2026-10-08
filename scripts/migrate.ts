import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool, sql } from '../lib/db';

async function main() {
  const reset = process.argv.includes('--reset');
  const supabase = process.argv.includes('--supabase');

  if (reset) {
    console.log('↺  dropping tables');
    await sql('drop table if exists lead_events, magic_tokens, leads, users cascade');
    await sql('drop sequence if exists ticket_seq');
  }

  const dir = join(process.cwd(), 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => (f.includes('rls_supabase') ? supabase : true))
    .sort();

  for (const file of files) {
    process.stdout.write(`→  ${file} … `);
    await sql(readFileSync(join(dir, file), 'utf8'));
    console.log('done');
  }

  await sql(
    `insert into users (email, name, role, telegram_chat_id) values
       ('nikhil@aanganstudio.in','Nikhil Deshpande','owner',null),
       ('sneha@aanganstudio.in','Sneha Rane','designer',null),
       ('arjun@aanganstudio.in','Arjun Mehta','designer',null)
     on conflict (email) do nothing`
  );

  console.log('\n✓ schema ready. Team seeded: nikhil@aanganstudio.in (owner), sneha@ and arjun@ (designers).');
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
