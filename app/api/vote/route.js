import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json } from '../../../lib/http';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { voterToken, candidateId } = await request.json();
    if (!voterToken || !candidateId) return json({ error: 'Missing voting information.' }, 400);

    const supabase = getSupabaseAdmin();

    const { data: settings, error: settingsError } = await supabase
      .from('party_settings')
      .select('voting_open')
      .eq('id', 1)
      .single();
    if (settingsError) throw settingsError;
    if (!settings.voting_open) return json({ error: 'Voting is not open right now.' }, 403);

    const { data: voter, error: voterError } = await supabase
      .from('contestants')
      .select('id')
      .eq('voter_token', voterToken)
      .maybeSingle();
    if (voterError) throw voterError;
    if (!voter) return json({ error: 'This phone is not registered to vote.' }, 401);
    if (voter.id === candidateId) return json({ error: 'You cannot vote for yourself.' }, 400);

    const { data: candidate, error: candidateError } = await supabase
      .from('contestants')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) return json({ error: 'That costume is no longer available.' }, 404);

    const { error: voteError } = await supabase
      .from('votes')
      .insert({ voter_id: voter.id, candidate_id: candidateId });

    if (voteError) {
      if (voteError.code === '23505') return json({ error: 'You have already voted.' }, 409);
      throw voteError;
    }

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Vote could not be recorded. Please try again.' }, 500);
  }
}
