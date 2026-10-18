import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json } from '../../../lib/http';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { voterToken } = await request.json();
    if (!voterToken) return json({ registered: false });

    const supabase = getSupabaseAdmin();
    const { data: contestant, error } = await supabase
      .from('contestants')
      .select('id, name')
      .eq('voter_token', voterToken)
      .maybeSingle();

    if (error) throw error;
    if (!contestant) return json({ registered: false });

    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .select('candidate_id')
      .eq('voter_id', contestant.id)
      .maybeSingle();
    if (voteError) throw voteError;

    return json({
      registered: true,
      contestant: { id: contestant.id, name: contestant.name },
      hasVoted: Boolean(vote)
    });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not verify registration.' }, 500);
  }
}
