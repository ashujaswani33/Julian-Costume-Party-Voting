import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json } from '../../../lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('party_settings')
      .select('party_name, registration_open, voting_open')
      .eq('id', 1)
      .single();

    if (error) throw error;
    return json(data);
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not load party settings.' }, 500);
  }
}
