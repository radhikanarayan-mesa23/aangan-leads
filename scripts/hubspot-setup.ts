import 'dotenv/config';
import { STAGES, HUBSPOT_STAGE_LABEL } from '../lib/stages';

/**
 * Creates the Aangan deal pipeline and the custom property ai_call_cost_inr,
 * then prints the IDs to paste into .env.
 *
 *   HUBSPOT_PRIVATE_APP_TOKEN=… npm run hubspot:setup
 */
const BASE = 'https://api.hubapi.com';
const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

async function hs(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  if (!token) {
    console.error('Set HUBSPOT_PRIVATE_APP_TOKEN first.');
    process.exit(1);
  }

  const labels = STAGES.map((s) => HUBSPOT_STAGE_LABEL[s]).filter(Boolean) as string[];
  const existing = await hs('/crm/v3/pipelines/deals');
  let pipeline = existing.results?.find((p: any) => p.label === 'Aangan Leads');
  let ownPipeline = true;

  if (pipeline) {
    console.log('Pipeline "Aangan Leads" already exists — reusing it.');
  } else {
    try {
      pipeline = await hs('/crm/v3/pipelines/deals', {
        method: 'POST',
        body: JSON.stringify({
          label: 'Aangan Leads',
          displayOrder: 1,
          stages: labels.map((label, i) => ({
            label,
            displayOrder: i,
            metadata: {
              probability:
                label === 'Closed won' || label === 'Completed' ? '1.0' : label === 'Closed lost' ? '0.0' : String(0.2 + i * 0.1),
            },
          })),
        }),
      });
      console.log('Created pipeline "Aangan Leads".');
    } catch (e) {
      // Creating a pipeline needs Sales Hub Professional or above. On a free or
      // Starter portal we map our board onto the pipeline that already exists
      // rather than failing the setup.
      ownPipeline = false;
      pipeline = existing.results?.[0];
      if (!pipeline) throw e;
      console.log(`Could not create a pipeline (${String(e).slice(0, 120)})`);
      console.log(`→ Falling back to the existing pipeline "${pipeline.label}".`);
      console.log('  Creating extra pipelines needs Sales Hub Professional; this works fine without it.\n');
    }
  }

  try {
    await hs('/crm/v3/properties/deals', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ai_call_cost_inr',
        label: 'AI call cost (₹)',
        type: 'number',
        fieldType: 'number',
        groupName: 'dealinformation',
      }),
    });
    console.log('Created the custom property ai_call_cost_inr.');
  } catch (e) {
    console.log('Custom property ai_call_cost_inr already exists (or could not be created):', String(e).slice(0, 120));
  }

  console.log('\nPaste this into .env and into Vercel:\n');
  console.log(`HUBSPOT_PIPELINE_ID=${pipeline.id}`);

  const stages: { label: string; id: string }[] = (pipeline.stages ?? []).map((st: any) => ({ label: st.label, id: st.id }));
  stages.sort((a, b) => labels.indexOf(a.label) - labels.indexOf(b.label));

  if (!ownPipeline) {
    // Map our eight board columns onto whatever stages this portal has, by
    // position, and ask for the result to be checked by eye before use.
    const theirs: { label: string; id: string }[] = (pipeline.stages ?? [])
      .slice()
      .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((st: any) => ({ label: st.label, id: st.id }));

    const map: Record<string, string> = {};
    STAGES.forEach((ours, i) => {
      const guess = theirs[Math.min(i, theirs.length - 1)];
      if (guess) map[ours] = guess.id;
    });
    // Closed won / closed lost are worth getting exactly right.
    const won = theirs.find((t) => /won/i.test(t.label));
    const lost = theirs.find((t) => /lost/i.test(t.label));
    if (won) {
      map['Converted'] = won.id;
      map['Completed'] = won.id;
    }
    if (lost) map['Not converted'] = lost.id;

    console.log(`HUBSPOT_STAGE_MAP=${JSON.stringify(map)}`);
    console.log('\n⚠️  That map was guessed by position. Check it against the columns below');
    console.log('    and adjust before relying on the HubSpot stage sync:\n');
    for (const t of theirs) {
      const mine = STAGES.filter((o) => map[o] === t.id).join(', ');
      console.log(`    ${t.label.padEnd(28)} ${t.id.padEnd(14)} ← ${mine || '(unused)'}`);
    }
  } else {
    console.log('\nStage ids (looked up at runtime, listed here for reference):');
    for (const st of stages) console.log(`  ${st.label.padEnd(28)} ${st.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
