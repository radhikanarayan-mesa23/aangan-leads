import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pushes `vaani_agent_prompt.md` and `rubric.md` into the Vaani agent.
 *
 * The agent is configurable over the API — persona, training, experience,
 * deployment — so the prompt lives in this repo and is deployed from here
 * rather than pasted into a dashboard and quietly drifting out of date.
 *
 *   npm run vaani:setup            # show the agent and what would change
 *   npm run vaani:setup -- --apply # write it
 */
const BASE = 'https://api.vaanivoice.ai';
const KEY = process.env.VAANI_API_KEY ?? '';
const APPLY = process.argv.includes('--apply');

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'X-API-Key': KEY, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  if (!KEY) {
    console.error('VAANI_API_KEY is not set.');
    process.exit(1);
  }

  const agents = (await api('/api/list-agents')) as any[];
  if (!agents.length) {
    console.error('No agents on this account. Create one in the dashboard first.');
    process.exit(1);
  }

  const agent =
    agents.find((a) => process.env.VAANI_AGENT_ID && a.id === process.env.VAANI_AGENT_ID) ??
    agents.find((a) => /lead|qualif|aangan|intake/i.test(`${a.agent_name} ${a.display_name}`)) ??
    agents[0];

  console.log(`Agent: ${agent.display_name} (${agent.id})`);
  console.log(`  published: ${agent.published} · deployment: ${JSON.stringify(agent.deployment_config)}\n`);

  const agentPrompt = readFileSync(join(process.cwd(), 'vaani_agent_prompt.md'), 'utf8');
  const rubric = readFileSync(join(process.cwd(), 'rubric.md'), 'utf8');

  // The platform's knowledge base takes uploaded files, not raw text, and the
  // guardrails field did not persist what we sent. Rather than let the agent
  // depend on knowledge that may not be there, the sections it must never get
  // wrong are appended to the prompt itself — scope, service area, the price
  // policy, booking and the callback promise. The prompt is the one surface we
  // can prove persisted.
  const section = (heading: RegExp) => {
    const m = rubric.match(heading);
    if (!m) return '';
    const start = m.index!;
    const next = rubric.indexOf('\n## ', start + 1);
    return rubric.slice(start, next === -1 ? undefined : next).trim();
  };

  const systemPrompt = [
    agentPrompt,
    '',
    '---',
    '',
    '# Reference facts (from rubric.md — the only things you may state as fact)',
    '',
    section(/^## 2\. What Aangan does/m),
    '',
    section(/^## 3\. Where Aangan works/m),
    '',
    section(/^## 6\. Price policy/m),
    '',
    section(/^## 10\. Booking eligibility/m),
    '',
    'If a caller asks anything not covered above, you do not know it. Offer the designer, or continue the questions.',
  ].join('\n');

  const greeting =
    'Namaste, thank you for calling Aangan Studio. This call is recorded so our designers can help you better. May I know your name?';

  // rubric.md §6 — the rules that must never bend. The API wants an object.
  const guardrails: Record<string, string> = {
    price:
      'Never state a price, a range, a per-sq-ft rate, a package cost or a "starting from" figure — not even approximately, however often you are asked. Say: "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it at the consultation."',
    promises: 'Never promise a timeline, discount, material, brand or vendor.',
    competitors: 'Never comment on competitors, well or badly.',
    advice: 'Never give design, structural, legal or Vastu advice.',
    off_script:
      'If asked anything outside the rubric, say: "That\'s something I can\'t answer on this call. Would you like me to pass it to a designer, or shall we continue with a few quick questions?" Never guess, never loop, never repeat the same line a third time.',
    existing_client:
      'An existing client with a complaint: stop the intake and say "I\'ll have Nikhil\'s team call you right away."',
    length: 'Keep the call under 5 minutes.',
  };

  console.log(`Will push:`);
  console.log(`  system prompt   prompt + rubric facts  (${systemPrompt.length.toLocaleString()} chars)`);
  console.log(`  knowledge base  rubric.md              (${rubric.length.toLocaleString()} chars)`);
  console.log(`  greeting        "${greeting.slice(0, 60)}…"`);
  console.log(`  guardrails      ${Object.keys(guardrails).length} rules\n`);

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to write it.');
    return;
  }

  // Words a Pune caller will say that a generic model mishears. Boosting them
  // is the difference between "Wakad" and "worked", which decides whether the
  // locality criterion can be judged at all.
  const keywords = [
    'Aangan', 'Pune', 'PCMC',
    'Kothrud', 'Baner', 'Aundh', 'Wakad', 'Koregaon Park', 'Kalyani Nagar', 'Viman Nagar',
    'Hadapsar', 'Magarpatta', 'NIBM', 'Kondhwa', 'Undri', 'Shivane', 'Warje', 'Erandwane',
    'Deccan', 'Pimpri', 'Chinchwad', 'Pimple Saudagar', 'Pimple Nilakh', 'Ravet', 'Hinjewadi',
    'Bavdhan', 'Wagholi', 'Balewadi',
    'BHK', 'carpet area', 'built-up', 'lakh', 'crore', 'sq ft',
    'modular kitchen', 'wardrobe', 'false ceiling', 'possession', 'renovation', 'vastu',
  ];

  await api(`/api/agent/${agent.id}/persona`, {
    method: 'PATCH',
    body: JSON.stringify({
      identity: {
        system_prompt: systemPrompt,
        personality: { tone: 'warm, unhurried, brief', role: 'front desk of an interior design studio in Pune' },
        greeting_message: {
          agent_message: greeting,
          agent_speech_delay: 0,
          interruptible: true,
          let_user_speak_first: false,
        },
      },
      senses_capabilities: {
        language: 'en',
        auto_detect: true,
        ears: {
          stt: {
            primary: {
              // Deepgram nova-3 'multi' code-switches mid-sentence, which is how
              // Pune actually speaks — a caller starts in English, slips into
              // Hindi for the budget, and back again. Pinned to 'en' it would
              // transcribe the Hindi as nonsense and the grade would follow.
              language: 'multi',
              keywords,
              config: { language: 'multi' },
            },
          },
        },
        brain: {
          llm: {
            // Let the platform pick the model that handles whatever language
            // was detected, rather than running Hindi through an English model.
            // The docs call this `auto_detect_llm`; the stored field is
            // `brain.llm.auto_detect`, and sending the documented name is
            // silently ignored. Send the real one.
            auto_detect: true,
            primary: {
              // The agent reads from a rubric and must not improvise; 0.7 invites
              // exactly the embroidery the guardrails forbid.
              parameters: { temperature: 0.3, top_p: 0.7, max_tokens: 1000 },
            },
          },
        },
      },
    }),
  });
  console.log('✓ persona — prompt, greeting, multilingual STT, ' + keywords.length + ' recognition keywords');

  await api(`/api/agent/${agent.id}/training`, {
    method: 'PATCH',
    body: JSON.stringify({
      knowledge: { use_rag: true, rag_knowledge_base_dict: { 'rubric.md': rubric } },
      know_how: {
        guardrails,
        faq: {
          'What does it cost? / What is your rate per square foot?':
            'Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you\'d like.',
          'Which areas do you cover?': 'Pune city and PCMC.',
          'How long does a project take?':
            'Design is three to four weeks from the first consultation, and execution runs eight to sixteen weeks.',
        },
      },
    }),
  });
  console.log('✓ training — rubric.md as knowledge, guardrails, FAQ');

  console.log(`\nDone. Agent ${agent.id}`);
  console.log('Set VAANI_AGENT_ID to that, then publish the agent and attach a phone number in the dashboard.');
}

main().catch((e) => {
  console.error(String(e).slice(0, 600));
  process.exit(1);
});
