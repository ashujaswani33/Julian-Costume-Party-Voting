import { isAdminRequest } from '../../../../lib/adminAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { json, safeName } from '../../../../lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const patch = {};

  if (typeof body.registrationOpen === 'boolean') {
    patch.registration_open = body.registrationOpen;
  }

  if (typeof body.votingOpen === 'boolean') {
    patch.voting_open = body.votingOpen;
    // Reopening voting always hides public results again.
    if (body.votingOpen) patch.results_visible = false;
  }

  if (typeof body.resultsVisible === 'boolean') {
    patch.results_visible = body.resultsVisible;
  }

  if (typeof body.partyName === 'string') {
    const partyName = safeName(body.partyName);
    if (!partyName) return json({ error: 'Party name cannot be blank.' }, 400);
    patch.party_name = partyName;
  }

  if (!Object.keys(patch).length) {
    return json({ error: 'No settings to update.' }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();

    // When revealing results, do the "voting must be closed" check as part of
    // the same database update. This avoids a separate read that can fail or
    // use stale state.
    let query = supabase
      .from('party_settings')
      .update(patch)
      .eq('id', 1);

    if (body.resultsVisible === true && typeof body.votingOpen !== 'boolean') {
      query = query.eq('voting_open', false);
    }

    const { data, error } = await query
      .select('party_name, registration_open, voting_open, results_visible')
      .maybeSingle();

    if (error) {
      console.error('party_settings update failed:', error);
      return json({
        error: `Supabase rejected the update: ${error.message}${error.code ? ` (${error.code})` : ''}`
      }, 500);
    }

    if (!data) {
      if (body.resultsVisible === true) {
        return json({ error: 'Close voting before showing results to guests.' }, 400);
      }
      return json({ error: 'Party settings row was not found.' }, 404);
    }

    return json({ settings: data });
  } catch (error) {
    console.error('party_settings route crashed:', error);
    return json({
      error: `Server error while updating party settings: ${error?.message || 'Unknown error'}`
    }, 500);
  }
}
