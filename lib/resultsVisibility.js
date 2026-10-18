const BUCKET = 'costume-photos';
const FLAG_PATH = '_system/results-visible.txt';

export async function getResultsVisible(supabase) {
  const { data, error } = await supabase.storage.from(BUCKET).download(FLAG_PATH);
  if (data && !error) return true;

  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  if (status === 400 || status === 404 || message.includes('not found') || message.includes('object not found')) return false;
  if (error) console.error('Could not read results visibility flag:', error);
  return false;
}

export async function setResultsVisible(supabase, visible) {
  if (visible) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(FLAG_PATH, Buffer.from('visible'), { contentType: 'text/plain', upsert: true });
    if (error) throw error;
    return true;
  }

  const { error } = await supabase.storage.from(BUCKET).remove([FLAG_PATH]);
  if (error) {
    const status = Number(error?.statusCode || error?.status || 0);
    const message = String(error?.message || '').toLowerCase();
    if (!(status === 400 || status === 404 || message.includes('not found'))) throw error;
  }
  return false;
}
