import 'dotenv/config';
import { env } from '../lib/env';

/**
 * Fires a call at the deployed webhook in exactly the shape Vaani sends, so the
 * whole chain can be tested before a phone number exists: webhook → grading →
 * board → Telegram → HubSpot.
 *
 *   npm run simulate-call                 # a hot lead, against production
 *   npm run simulate-call -- low          # a low lead
 *   npm run simulate-call -- escalate     # an existing client complaining
 *   npm run simulate-call -- hinglish     # a caller who switches language
 *   npm run simulate-call -- hot local    # against http://localhost:3000
 */
const SCRIPTS: Record<string, { name: string; phone: string; transcript: string; note: string }> = {
  hot: {
    name: 'Test Caller (hot)',
    phone: '+9198******01',
    note: 'Baner 3BHK, budget stated, two months — should grade HOT',
    transcript: [
      'Agent: Namaste, thank you for calling Aangan Studio. This call is recorded so our designers can help you better. May I know your name?',
      'User: Hi, this is Ritu. We just got possession of a 3BHK in Baner.',
      'Agent: Congratulations. Roughly how many square feet is the carpet area?',
      'User: About eleven hundred square feet. We want the whole home done.',
      'Agent: And when would you like it completed?',
      'User: Within two months. We have kept twenty two to twenty five lakh aside. My husband and I decide together.',
      'Agent: Any particular style you like?',
      'User: Modern, warm, lots of wood. My email is ritu.sharma@gmail.com',
    ].join('\n'),
  },
  low: {
    name: 'Test Caller (low)',
    phone: '+9198******02',
    note: 'Talegaon — outside the service area, should grade LOW',
    transcript: [
      'Agent: Namaste, thank you for calling Aangan Studio. May I know your name?',
      'User: Mahesh. We have a bungalow in Talegaon, about eighteen hundred square feet.',
      'Agent: I should be upfront — we work only across Pune and PCMC, so Talegaon we would not be able to take on.',
      'User: Oh, that is a pity.',
    ].join('\n'),
  },
  escalate: {
    name: 'Test Caller (escalate)',
    phone: '+9198******03',
    note: 'Existing client complaining — should grade ESCALATE and alert the owner',
    transcript: [
      'Agent: Namaste, thank you for calling Aangan Studio. May I know your name?',
      'User: Sanjay Pawar. My kitchen from your team is half done and nobody has called me back for three weeks.',
      'Agent: I am really sorry about that. I will have Nikhil\'s team call you right away.',
    ].join('\n'),
  },
  hinglish: {
    name: 'Test Caller (switches language)',
    phone: '+9198******04',
    note: 'Opens in English, switches to Hindi — should flag LANGUAGE',
    transcript: [
      'Agent: Namaste, thank you for calling Aangan Studio. May I know your name?',
      'User: Haan ji, Deepak. Humara 2BHK hai Wakad mein, around 850 square feet.',
      'Agent: And what would you like done?',
      'User: Poora ghar karwana hai. Budget abhi decide nahi kiya, maybe fifteen lakh. Teen mahine mein chahiye.',
      'Agent: Thank you. A designer will call you within the hour.',
    ].join('\n'),
  },
};

async function main() {
  const which = process.argv.slice(2).find((a) => a in SCRIPTS) ?? 'hot';
  // APP_URL is localhost in a developer's .env (magic links need it), so the
  // default target is the deployed app — testing the thing Vaani will actually
  // call. Pass `local` to hit a dev server instead.
  const local = process.argv.includes('local');
  const base = local
    ? 'http://localhost:3000'
    : process.env.DEPLOY_URL || (env.APP_URL.includes('localhost') ? 'https://aangan-leads.vercel.app' : env.APP_URL);
  const s = SCRIPTS[which];

  const callId = `sim-${which}-${Date.now()}`;
  const body = {
    event: 'call_postprocessing',
    timestamp: new Date().toISOString(),
    events: [
      {
        event: 'call_postprocessing',
        call_id: callId,
        timestamp: new Date().toISOString(),
        data: {
          call_id: callId,
          room_name: callId,
          end_reason: 'completed',
          call_duration: 198_000, // milliseconds on this event, as Vaani sends it
          phone_number: s.phone,
          transcript: s.transcript,
          summary: s.note,
          entities: { customer_name: s.name },
          recording_url: null,
        },
      },
      { event: 'call_ended', timestamp: new Date().toISOString(), data: { call_id: callId, end_reason: 'completed', call_duration: 198 } },
    ],
  };

  const url = `${base}/api/vaani/call-ended?secret=${encodeURIComponent(env.VAANI_WEBHOOK_SECRET)}`;
  console.log(`Simulating "${which}" → ${base}`);
  console.log(`  ${s.note}\n`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.text();
  console.log(`  HTTP ${res.status}  ${out}\n`);

  if (!res.ok) {
    console.error('  The webhook rejected it. Check VAANI_WEBHOOK_SECRET matches the one registered in Vaani.');
    process.exit(1);
  }

  const ticket = (() => {
    try {
      return JSON.parse(out).ticket_no;
    } catch {
      return null;
    }
  })();
  console.log('  Grading runs after the 200, so give it a few seconds, then:');
  console.log(`    ${base}/board${ticket ? `   — look for ${ticket}` : ''}`);
  console.log('    npm run show-call -- ' + callId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
