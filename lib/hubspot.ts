import { env, has } from './env';
import { HUBSPOT_STAGE_LABEL, type Stage } from './stages';

const BASE = 'https://api.hubapi.com';

// ASSUME: HubSpot stage IDs are discovered at runtime from the pipeline named
// by HUBSPOT_PIPELINE_ID, so scripts/hubspot-setup.ts only has to print one id.
let stageIdCache: { at: number; map: Record<string, string> } | null = null;

async function hs(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HubSpot ${init.method ?? 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<any>;
}

function overrideMap(): Record<string, string> {
  if (!env.HUBSPOT_STAGE_MAP) return {};
  try {
    return JSON.parse(env.HUBSPOT_STAGE_MAP) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * The HubSpot stage id for one of our board columns. An explicit
 * HUBSPOT_STAGE_MAP wins, then a label match inside the configured pipeline.
 * Returns null rather than guessing, so a deal is never silently filed under
 * the wrong stage.
 */
export async function resolveStageId(stage: Stage): Promise<string | null> {
  const override = overrideMap()[stage];
  if (override) return override;
  const label = HUBSPOT_STAGE_LABEL[stage];
  if (!label) return null;
  const ids = await stageIds();
  return ids[label] ?? null;
}

export async function stageIds(): Promise<Record<string, string>> {
  if (stageIdCache && Date.now() - stageIdCache.at < 10 * 60_000) return stageIdCache.map;
  const body = await hs(`/crm/v3/pipelines/deals/${env.HUBSPOT_PIPELINE_ID}`);
  const map: Record<string, string> = {};
  for (const s of body.stages ?? []) map[s.label] = s.id;
  stageIdCache = { at: Date.now(), map };
  return map;
}

export async function upsertContact(lead: {
  caller_name?: string | null;
  caller_email?: string | null;
  caller_number?: string | null;
  ticket_no: string;
}): Promise<string> {
  const email = lead.caller_email || `${lead.ticket_no.toLowerCase()}@aangan.invalid`;
  const [firstname, ...rest] = (lead.caller_name ?? 'Aangan caller').split(' ');
  try {
    const found = await hs('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email'],
        limit: 1,
      }),
    });
    if (found.results?.[0]?.id) return String(found.results[0].id);
  } catch {
    /* fall through to create */
  }
  const created = await hs('/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties: { email, firstname, lastname: rest.join(' ') || '—', phone: lead.caller_number ?? '' } }),
  });
  return String(created.id);
}

/**
 * The deal is created the first time a designer moves a card out of New
 * (CLAUDE.md §9). Internal estimate values never leave the dashboard, so the
 * deal amount is the designer-entered deal_value_inr only.
 */
export async function createDeal(opts: {
  contactId: string;
  ticket_no: string;
  caller_name?: string | null;
  stage: Stage;
  deal_value_inr?: number | null;
  cost_inr?: number | null;
}): Promise<string> {
  const stageId = await resolveStageId(opts.stage);
  const deal = await hs('/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        dealname: `${opts.ticket_no} — ${opts.caller_name ?? 'Aangan enquiry'}`,
        pipeline: env.HUBSPOT_PIPELINE_ID,
        dealstage: stageId ?? undefined,
        amount: opts.deal_value_inr ?? undefined,
        ai_call_cost_inr: opts.cost_inr ?? undefined,
      },
      associations: [
        { to: { id: opts.contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] },
      ],
    }),
  });
  return String(deal.id);
}

export async function updateDealStage(dealId: string, stage: Stage, dealValue?: number | null): Promise<void> {
  const stageId = await resolveStageId(stage);
  if (!stageId) throw new Error(`No HubSpot stage is mapped for "${stage}" — set HUBSPOT_STAGE_MAP (npm run hubspot:setup prints one).`);
  await hs(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { dealstage: stageId, ...(dealValue ? { amount: dealValue } : {}) } }),
  });
}

export const hubspotReady = () => has.hubspot();
