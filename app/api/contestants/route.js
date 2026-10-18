import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json } from '../../../lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('contestants')
      .select('id, name, photo_path, created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const contestants = await Promise.all((data || []).map(async (row) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from('costume-photos')
        .createSignedUrl(row.photo_path, 60 * 60);
      if (signedError) throw signedError;
      return { id: row.id, name: row.name, photoUrl: signed.signedUrl };
    }));

    return json({ contestants });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not load costumes.' }, 500);
  }
}
