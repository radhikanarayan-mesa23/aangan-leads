import 'dotenv/config';
import { env } from '../lib/env';

/**
 * Finds the chat ids the bot can reach. Telegram only reveals a chat once
 * someone has spoken to the bot there, so this is a read of getUpdates rather
 * than a lookup — send a message first, then run it.
 *
 *   npm run telegram:ids
 */
async function main() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is not set.');
    process.exit(1);
  }

  const me = await (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`)).json();
  if (!me.ok) {
    console.error('Bad token:', me.description);
    process.exit(1);
  }
  console.log(`Bot: @${me.result.username}\n`);

  const res = await (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`)).json();
  const chats = new Map<number, { type: string; name: string }>();
  for (const u of res.result ?? []) {
    const m = u.message ?? u.channel_post ?? u.my_chat_member ?? {};
    const c = m.chat;
    if (c?.id && !chats.has(c.id)) {
      chats.set(c.id, { type: c.type, name: c.title ?? [c.first_name, c.last_name].filter(Boolean).join(' ') ?? '—' });
    }
  }

  if (chats.size === 0) {
    console.log('No chats yet. Telegram only reveals a chat after the bot has seen a message there.\n');
    console.log(`  Owner  → open https://t.me/${me.result.username} and send "hello"`);
    console.log(`  Designers → add @${me.result.username} to the designers group, then send "hello" in it`);
    console.log('\nThen run this again.');
    return;
  }

  console.log('Chats the bot can reach:\n');
  for (const [id, c] of chats) {
    const which = id < 0 ? 'TELEGRAM_DESIGNER_CHAT_ID' : 'TELEGRAM_OWNER_CHAT_ID';
    console.log(`  ${String(id).padEnd(16)} ${c.type.padEnd(10)} ${c.name}`);
    console.log(`  → likely ${which}=${id}\n`);
  }
  console.log('Group ids are negative; a direct chat is positive.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
