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
    if (typeof body.votingOpen === 'boolean') patch.voting_open = body.votingOpen;
    if (typeof body.partyName === 'string') {
      const partyName = safeName(body.partyName);
      if (!partyName) return json({ error: 'Party name cannot be blank.' }, 400);
      patch.party_name = partyName;
    }

    if (!Object.keys(patch).length) return json({ error: 'No settings to update.' }, 400);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('party_settings')
      .update(patch)
      .eq('id', 1)
      .select('party_name, registration_open, voting_open')
      .single();
    if (error) throw error;

    return json({ settings: data });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not update party settings.' }, 500);
  }
}
