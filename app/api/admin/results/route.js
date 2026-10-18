import { isAdminRequest } from '../../../../lib/adminAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { json } from '../../../../lib/http';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: settings, error: settingsError }, { data: contestants, error: contestantsError }, { data: votes, error: votesError }] = await Promise.all([
      supabase.from('party_settings').select('party_name, registration_open, voting_open').eq('id', 1).single(),
      supabase.from('contestants').select('id, name, created_at').order('created_at', { ascending: true }),
      supabase.from('votes').select('voter_id, candidate_id, created_at').order('created_at', { ascending: true })
    ]);

    if (settingsError) throw settingsError;
    if (contestantsError) throw contestantsError;
    if (votesError) throw votesError;

    const contestantRows = contestants || [];
    const voteRows = votes || [];
    const counts = Object.fromEntries(contestantRows.map((c) => [c.id, 0]));
    const names = Object.fromEntries(contestantRows.map((c) => [c.id, c.name]));

    for (const vote of voteRows) {
      if (vote.candidate_id in counts) counts[vote.candidate_id] += 1;
    }

    return json({
      settings,
      totalVotes: voteRows.length,
      contestants: contestantRows.map((c) => ({ ...c, votes: counts[c.id] || 0 })),
      voteDetails: voteRows.map((vote) => ({
        voterId: vote.voter_id,
        voterName: names[vote.voter_id] || 'Unknown guest',
        candidateId: vote.candidate_id,
        candidateName: names[vote.candidate_id] || 'Unknown guest',
        createdAt: vote.created_at
      }))
    });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not load admin results.' }, 500);
  }
}
