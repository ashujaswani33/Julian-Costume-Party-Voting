import crypto from 'crypto';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { DEMO_IMAGES } from '../../../../lib/demoImages';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { json } from '../../../../lib/http';

export const runtime = 'nodejs';

const BUCKET = 'costume-photos';
const DEMO_PREFIX = 'demo/';

const DEMO_NAMES = [
  'Pumpkin King', 'Midnight Ghost', 'Wicked Witch', 'Count Fang', 'Bone Collector',
  'Green Monster', 'Walking Dead', 'Red Devil', 'Space Alien', 'Night Bat',
  'Haunted Bride', 'Creepy Clown', 'Grim Reaper', 'Black Cat', 'Mummy Returns',
  'Headless Rider', 'Mad Scientist', 'Scarecrow', 'Spider Queen', 'Werewolf',
  'Phantom', 'Zombie Prom', 'Dark Knight', 'Possessed Doll', 'Swamp Creature',
  'Fortune Teller', 'Skeleton Crew', 'Demon Doctor', 'Moon Witch', 'Grave Digger',
  'Candy Killer', 'Vampire Royalty', 'Haunted Pirate', 'Toxic Zombie', 'Shadow Ghost',
  'Pumpkin Witch', 'Alien Visitor', 'Bat Queen', 'Monster Mash', 'Devil in Red',
  'Bone Daddy', 'Gothic Angel', 'Cursed Cowboy', 'Dead Disco', 'Nightmare Nurse',
  'Crypt Keeper', 'Ghostly Groom', 'Witch Doctor', 'Undead Rockstar', 'Final Boss'
];

function clampCount(value) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return 12;
  return Math.max(5, Math.min(50, numeric));
}

async function removeExistingDemoData(supabase) {
  const { data: rows, error: selectError } = await supabase
    .from('contestants')
    .select('id, photo_path');

  if (selectError) throw selectError;

  const demoRows = (rows || []).filter((row) => typeof row.photo_path === 'string' && row.photo_path.startsWith(DEMO_PREFIX));
  if (!demoRows.length) return { contestantsRemoved: 0, photosRemoved: 0 };

  const demoIds = demoRows.map((row) => row.id);
  const demoPaths = demoRows.map((row) => row.photo_path);

  // Votes disappear automatically because votes reference contestants ON DELETE CASCADE.
  const { error: deleteError } = await supabase.from('contestants').delete().in('id', demoIds);
  if (deleteError) throw deleteError;

  const { error: storageError } = await supabase.storage.from(BUCKET).remove(demoPaths);
  if (storageError) {
    // Database cleanup already succeeded, so log storage cleanup failures without restoring demo rows.
    console.error('Demo photo cleanup failed:', storageError);
  }

  return {
    contestantsRemoved: demoRows.length,
    photosRemoved: storageError ? 0 : demoPaths.length
  };
}

async function uploadDemoPhotos(supabase, count) {
  const rows = Array.from({ length: count }, (_, i) => {
    const image = DEMO_IMAGES[i % DEMO_IMAGES.length];
    const number = String(i + 1).padStart(2, '0');
    return {
      image,
      row: {
        name: `DEMO ${number} - ${DEMO_NAMES[i]}`,
        photo_path: `${DEMO_PREFIX}demo-${number}.png`
      }
    };
  });

  // Upload in small parallel batches so 50 demo entries are still quick without
  // hammering Supabase Storage with 50 simultaneous requests.
  for (let start = 0; start < rows.length; start += 10) {
    const batch = rows.slice(start, start + 10);
    await Promise.all(batch.map(async ({ image, row }) => {
      const body = Buffer.from(image.base64, 'base64');
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(row.photo_path, body, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: '3600'
        });
      if (error) throw error;
    }));
  }

  return rows.map(({ row }) => row);
}

function makeRandomVotes(contestants) {
  if (contestants.length < 2) return [];

  return contestants.map((voter, voterIndex) => {
    // Pick a random contestant other than the voter.
    const offset = crypto.randomInt(1, contestants.length);
    const candidate = contestants[(voterIndex + offset) % contestants.length];
    return {
      voter_id: voter.id,
      candidate_id: candidate.id
    };
  });
}

export async function POST(request) {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const count = clampCount(body.count);
    const supabase = getSupabaseAdmin();

    await removeExistingDemoData(supabase);
    const contestantRows = await uploadDemoPhotos(supabase, count);

    const { data: inserted, error: insertError } = await supabase
      .from('contestants')
      .insert(contestantRows)
      .select('id, name, photo_path');

    if (insertError) throw insertError;

    const voteRows = makeRandomVotes(inserted || []);
    if (voteRows.length) {
      const { error: votesError } = await supabase.from('votes').insert(voteRows);
      if (votesError) throw votesError;
    }

    return json({
      ok: true,
      contestantsCreated: inserted?.length || 0,
      votesCreated: voteRows.length,
      message: `Created ${inserted?.length || 0} demo entries with ${voteRows.length} random votes.`
    });
  } catch (error) {
    console.error('Could not create demo data:', error);
    return json({ error: error?.message || 'Could not create demo data.' }, 500);
  }
}

export async function DELETE() {
  if (!(await isAdminRequest())) return json({ error: 'Unauthorized.' }, 401);

  try {
    const supabase = getSupabaseAdmin();
    const removed = await removeExistingDemoData(supabase);
    return json({
      ok: true,
      ...removed,
      message: removed.contestantsRemoved
        ? `Removed ${removed.contestantsRemoved} demo entries and their votes.`
        : 'No demo entries were found.'
    });
  } catch (error) {
    console.error('Could not remove demo data:', error);
    return json({ error: error?.message || 'Could not remove demo data.' }, 500);
  }
}
