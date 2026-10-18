import { isAdminRequest } from '../../../../lib/adminAuth';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { json } from '../../../../lib/http';

export const runtime = 'nodejs';

export async function POST() {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('votes').delete().neq('voter_id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not clear votes.' }, 500);
  }
}
