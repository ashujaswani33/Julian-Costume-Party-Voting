import crypto from 'crypto';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { json, safeName } from '../../../lib/http';

export const runtime = 'nodejs';

const MAX_BYTES = 3.5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: settings, error: settingsError } = await supabase
      .from('party_settings')
      .select('registration_open')
      .eq('id', 1)
      .single();
    if (settingsError) throw settingsError;
    if (!settings.registration_open) return json({ error: 'Registration is closed.' }, 403);

    const form = await request.formData();
    const name = safeName(form.get('name'));
    const photo = form.get('photo');

    if (!name) return json({ error: 'Please enter your name.' }, 400);
    if (!photo || typeof photo.arrayBuffer !== 'function' || typeof photo.type !== 'string') return json({ error: 'Please choose a costume photo.' }, 400);
    if (!ALLOWED_TYPES.has(photo.type)) return json({ error: 'Please use a JPG, PNG, or WebP photo.' }, 400);
    if (photo.size <= 0 || photo.size > MAX_BYTES) return json({ error: 'Photo is still too large. Please choose a smaller photo.' }, 400);

    const token = crypto.randomUUID();
    const id = crypto.randomUUID();
    const path = `${id}.${extensionFor(photo.type)}`;
    const bytes = Buffer.from(await photo.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('costume-photos')
      .upload(path, bytes, { contentType: photo.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: inserted, error: insertError } = await supabase
      .from('contestants')
      .insert({ id, name, photo_path: path, voter_token: token })
      .select('id, name')
      .single();

    if (insertError) {
      await supabase.storage.from('costume-photos').remove([path]);
      if (insertError.code === '23505') return json({ error: 'That name is already registered. Add a last initial if needed.' }, 409);
      throw insertError;
    }

    return json({ contestant: inserted, voterToken: token }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: 'Registration failed. Please try again.' }, 500);
  }
}
