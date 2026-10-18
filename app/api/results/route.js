import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json } from '../../../lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: settings, error: settingsError } = await supabase
      .from('party_settings')
      .select('voting_open, results_visible')
      .eq('id', 1)
      .single();

    if (settingsError) throw settingsError;
    if (!settings?.results_visible || settings?.voting_open) return json({ visible: false });

    const [{ data: contestants, error: contestantsError }, { data: votes, error: votesError }] = await Promise.all([
      supabase.from('contestants').select('id, name, created_at').order('created_at', { ascending: true }),
      supabase.from('votes').select('candidate_id')
    ]);

    if (contestantsError) throw contestantsError;
    if (votesError) throw votesError;

    const rows = contestants || [];
    const voteRows = votes || [];
    const counts = Object.fromEntries(rows.map((row) => [row.id, 0]));
    for (const vote of voteRows) {
      if (vote.candidate_id in counts) counts[vote.candidate_id] += 1;
    }

    const ranking = rows
      .map((row) => ({ id: row.id, name: row.name, votes: counts[row.id] || 0 }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    return json({ visible: true, totalVotes: voteRows.length, ranking });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not load public results.' }, 500);
  }
}
