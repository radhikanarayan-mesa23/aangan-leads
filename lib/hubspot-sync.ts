import { sql } from './db';
import { getLead, logEvent, logStepError, n } from './leads';
import { createDeal, hubspotReady, updateDealStage, upsertContact } from './hubspot';
import type { Stage } from './stages';

/** The deal is created the first time a card leaves New (CLAUDE.md §9). */
export async function syncHubspot(leadId: string, stage: Stage): Promise<void> {
  if (!hubspotReady()) return;
  const lead = await getLead(leadId);
  if (!lead) return;

  try {
    let dealId = lead.hubspot_deal_id;
    if (!dealId && stage !== 'New') {
      const contactId = lead.hubspot_contact_id ?? (await upsertContact(lead));
      dealId = await createDeal({
        contactId,
        ticket_no: lead.ticket_no,
        caller_name: lead.caller_name,
        stage,
        deal_value_inr: n(lead.deal_value_inr),
        cost_inr: n(lead.cost_inr),
      });
      await sql('update leads set hubspot_contact_id = $2, hubspot_deal_id = $3, hubspot_sync_error = null where id = $1', [
        leadId,
        contactId,
        dealId,
      ]);
    } else if (dealId) {
      await updateDealStage(dealId, stage, n(lead.deal_value_inr));
      await sql('update leads set hubspot_sync_error = null where id = $1', [leadId]);
    } else {
      return;
    }
    await logEvent({ lead_id: leadId, type: 'hubspot_sync', note: `Deal synced to "${stage}".` });
  } catch (e) {
    await sql('update leads set hubspot_sync_error = $2 where id = $1', [leadId, String(e).slice(0, 400)]);
    await logStepError(leadId, 'hubspot', e);
  }
}
