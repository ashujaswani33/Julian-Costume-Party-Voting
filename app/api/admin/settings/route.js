import { isAdminRequest } from '../../../../lib/adminAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { json, safeName } from '../../../../lib/http';
import { getResultsVisible, setResultsVisible } from '../../../../lib/resultsVisibility';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  try {
    const body = await request.json();
    const patch = {};

    if (typeof body.registrationOpen === 'boolean') patch.registration_open = body.registrationOpen;
    if (typeof body.votingOpen === 'boolean') patch.voting_open = body.votingOpen;
    if (typeof body.partyName === 'string') {
      const partyName = safeName(body.partyName);
      if (!partyName) return json({ error: 'Party name cannot be blank.' }, 400);
      patch.party_name = partyName;
    }

    const hasResultsChange = typeof body.resultsVisible === 'boolean';
    if (!Object.keys(patch).length && !hasResultsChange) return json({ error: 'No settings to update.' }, 400);

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

    let data = null;
    if (Object.keys(patch).length) {
      const result = await supabase
        .from('party_settings')
        .update(patch)
        .eq('id', 1)
        .select('party_name, registration_open, voting_open')
        .single();
      if (result.error) throw result.error;
      data = result.data;
    } else {
      const result = await supabase
        .from('party_settings')
        .select('party_name, registration_open, voting_open')
        .eq('id', 1)
        .single();
      if (result.error) throw result.error;
      data = result.data;
    }

    if (body.votingOpen === true) {
      await setResultsVisible(supabase, false);
    } else if (hasResultsChange) {
      await setResultsVisible(supabase, body.resultsVisible);
    }

    const resultsVisible = await getResultsVisible(supabase);
    return json({ settings: { ...data, results_visible: resultsVisible } });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not update party settings.' }, 500);
  }
}
