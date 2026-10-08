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

  if (pipeline) {
    console.log('Pipeline "Aangan Leads" already exists — reusing it.');
  } else {
    pipeline = await hs('/crm/v3/pipelines/deals', {
      method: 'POST',
      body: JSON.stringify({
        label: 'Aangan Leads',
        displayOrder: 1,
        stages: labels.map((label, i) => ({
          label,
          displayOrder: i,
          metadata: {
            probability: label === 'Closed won' || label === 'Completed' ? '1.0' : label === 'Closed lost' ? '0.0' : String(0.2 + i * 0.1),
          },
        })),
      }),
    });
    console.log('Created pipeline "Aangan Leads".');
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

  console.log('\nPaste this into .env:\n');
  console.log(`HUBSPOT_PIPELINE_ID=${pipeline.id}`);
  console.log('\nStage ids (looked up at runtime, listed here for reference):');
  for (const s of pipeline.stages ?? []) console.log(`  ${s.label.padEnd(28)} ${s.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
