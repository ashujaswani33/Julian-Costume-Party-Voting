import { isAdminRequest } from '../../../../lib/adminAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { json, safeName } from '../../../../lib/http';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  try {
    const body = await request.json();
    const patch = {};

    if (typeof body.registrationOpen === 'boolean') patch.registration_open = body.registrationOpen;
    if (typeof body.votingOpen === 'boolean') {
      patch.voting_open = body.votingOpen;
      if (body.votingOpen) patch.results_visible = false;
    }
    if (typeof body.resultsVisible === 'boolean') patch.results_visible = body.resultsVisible;
    if (typeof body.partyName === 'string') {
      const partyName = safeName(body.partyName);
      if (!partyName) return json({ error: 'Party name cannot be blank.' }, 400);
      patch.party_name = partyName;
    }

    if (!Object.keys(patch).length) return json({ error: 'No settings to update.' }, 400);

    const supabase = getSupabaseAdmin();

    if (body.resultsVisible === true) {
      const { data: current, error: currentError } = await supabase
        .from('party_settings')
        .select('voting_open')
        .eq('id', 1)
        .single();
      if (currentError) throw currentError;
      const votingWillBeOpen = typeof body.votingOpen === 'boolean' ? body.votingOpen : current?.voting_open;
      if (votingWillBeOpen) return json({ error: 'Close voting before showing results to guests.' }, 400);
    }

    const { data, error } = await supabase
      .from('party_settings')
      .update(patch)
      .eq('id', 1)
      .select('party_name, registration_open, voting_open, results_visible')
      .single();

    if (error) {
      if (error.code === '42703' || String(error.message || '').includes('results_visible')) {
        return json({ error: 'One-time setup needed: add a results_visible boolean column to party_settings in Supabase.' }, 500);
      }
      throw error;
    }

    return json({ settings: data });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not update party settings.' }, 500);
  }
}
