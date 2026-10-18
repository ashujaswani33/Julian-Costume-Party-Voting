import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json } from '../../../lib/http';
import { getResultsVisible } from '../../../lib/resultsVisibility';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data, error }, resultsVisible] = await Promise.all([
      supabase
        .from('party_settings')
        .select('party_name, registration_open, voting_open')
        .eq('id', 1)
        .single(),
      getResultsVisible(supabase)
    ]);

    if (error) throw error;
    return json({ ...data, results_visible: resultsVisible });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not load party settings.' }, 500);
  }
}
