'use client';

import { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'costume_party_voter_token';
const SAFE_UPLOAD_BYTES = 3 * 1024 * 1024;

async function readApiResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413 || text.toLowerCase().includes('request entity') || text.toLowerCase().includes('payload too large')) {
      return { error: 'That photo is too large to upload. Please choose a smaller photo and try again.' };
    }
    return { error: 'The server returned an unexpected response. Please try again.' };
  }
}

async function compressCostumePhoto(file) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type)) {
    throw new Error('Please choose a JPG, PNG, or WebP photo.');
  }
  if (file.size <= SAFE_UPLOAD_BYTES) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo could not be read. Please try a different JPG, PNG, or WebP photo.'));
      img.src = objectUrl;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not prepare the photo. Please try a smaller image.');
    ctx.drawImage(image, 0, 0, width, height);

    async function makeBlob(quality) {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare the photo. Please try another image.')), 'image/jpeg', quality);
      });
    }

    let blob = await makeBlob(0.82);
    if (blob.size > SAFE_UPLOAD_BYTES) blob = await makeBlob(0.68);
    if (blob.size > SAFE_UPLOAD_BYTES) {
      throw new Error('The photo is still too large after resizing. Please choose a smaller photo.');
    }
    return new File([blob], 'costume.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function HomePage() {
  const [settings, setSettings] = useState({ party_name: 'Costume Party', registration_open: true, voting_open: false });
  const [contestants, setContestants] = useState([]);
  const [me, setMe] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [voting, setVoting] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadPublic() {
    try {
      const [settingsRes, contestantsRes] = await Promise.all([
        fetch('/api/settings', { cache: 'no-store' }),
        fetch('/api/contestants', { cache: 'no-store' })
      ]);
      const settingsData = await readApiResponse(settingsRes);
      const contestantsData = await readApiResponse(contestantsRes);
      if (settingsRes.ok) setSettings(settingsData);
      if (contestantsRes.ok) setContestants(contestantsData.contestants || []);
    } catch {
      setError('Could not load the party right now. Please refresh.');
    }
  }

  async function loadMe() {
    const voterToken = window.localStorage.getItem(TOKEN_KEY);
    if (!voterToken) return;
    try {
      const res = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterToken })
      });
      const data = await readApiResponse(res);
      if (res.ok && data.registered) {
        setMe(data.contestant);
        setHasVoted(Boolean(data.hasVoted));
      } else if (res.ok && !data.registered) {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // Keep the guest page usable even if token verification temporarily fails.
    }
  }

  useEffect(() => {
    Promise.all([loadPublic(), loadMe()]).finally(() => setLoading(false));
    const timer = window.setInterval(loadPublic, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!photo) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const eligibleContestants = useMemo(
    () => contestants.filter((contestant) => contestant.id !== me?.id),
    [contestants, me]
  );

  async function handlePhotoSelection(event) {
    const selected = event.target.files?.[0] || null;
    setError('');
    setMessage('');

    if (!selected) {
      return;
    }

    try {
      const optimized = await compressCostumePhoto(selected);
      setPhoto(optimized);
      if (optimized.size < selected.size) {
        setMessage('Large photo optimized automatically. Ready to register.');
      }
    } catch (err) {
      setPhoto(null);
      event.target.value = '';
      setError(err.message || 'Please choose a different photo.');
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!name.trim() || !photo) {
      setError('Please enter your name and choose a costume photo.');
      return;
    }

    setRegistering(true);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('photo', photo);

      const res = await fetch('/api/register', { method: 'POST', body: form });
      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Registration failed.');

      window.localStorage.setItem(TOKEN_KEY, data.voterToken);
      setMe(data.contestant);
      setHasVoted(false);
      setName('');
      setPhoto(null);
      setMessage(`You're registered, ${data.contestant.name}! Keep using this phone when voting opens.`);
      await loadPublic();
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setRegistering(false);
    }
  }

  async function handleVote(candidate) {
    if (!me || hasVoted || voting) return;
    const confirmed = window.confirm(`Vote for ${candidate.name}? You can only vote once.`);
    if (!confirmed) return;

    setVoting(true);
    setError('');
    setMessage('');
    try {
      const voterToken = window.localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterToken, candidateId: candidate.id })
      });
      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Vote failed.');
      setHasVoted(true);
      setMessage('Your vote has been recorded. Vote totals are visible only to the admin.');
    } catch (err) {
      setError(err.message || 'Vote could not be recorded.');
      await loadMe();
    } finally {
      setVoting(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">🎃 Julian's Halloween Party • Costume Competition</div>
        <h1>Julian Halloween Party Costume Competition</h1>
        <p className="spooky-challenge">Only the scared ones won’t register. 👻</p>
        <p className="muted hero-copy">Show us what you’ve got. Register your costume now for a chance to claim a <strong>HEFTY reward</strong> at the end of the party.</p>
        <div className="prize-banner" role="note">🏆 Dress to impress. Bragging rights are temporary. The reward is real.</div>
        <div className="row">
          <span className={`badge ${settings.registration_open ? 'open' : ''}`}>Registration {settings.registration_open ? 'open' : 'closed'}</span>
          <span className={`badge ${settings.voting_open ? 'open' : ''}`}>Voting {settings.voting_open ? 'open' : 'closed'}</span>
        </div>
      </section>

      {loading ? <div className="card">Loading party…</div> : null}
      {error ? <div className="notice error-text" role="alert">{error}</div> : null}
      {message ? <div className="notice success-text" role="status">{message}</div> : null}

      {!loading && !me && (
        <section className="grid two" style={{ marginTop: 16 }}>
          <form className="card stack" onSubmit={handleRegister}>
            <div>
              <h2>🎭 Dare to enter?</h2>
              <p className="muted">Add your name and costume photo. Use the same phone later when the showdown moves to voting.</p>
            </div>

            {!settings.registration_open ? (
              <div className="notice">Registration is closed. Ask the party host if you still need to join.</div>
            ) : (
              <>
                <label>
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Example: Alex" autoComplete="name" required />
                </label>

                <div className="stack">
                  <div style={{ fontWeight: 700 }}>Costume photo</div>
                  <div className="row">
                    <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      📷 Take Photo
                      <input
                        className="hidden"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoSelection}
                      />
                    </label>
                    <label className="btn secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      🖼️ Choose From Gallery
                      <input
                        className="hidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoSelection}
                      />
                    </label>
                  </div>
                </div>

                <div className="muted" style={{ fontSize: '.88rem' }}>Use the camera or choose an existing JPG, PNG, or WebP photo. Large photos are automatically resized for upload.</div>
                {preview ? <img className="preview" src={preview} alt="Your costume preview" /> : null}

                <button className="btn" type="submit" disabled={registering}>
                  {registering ? 'Entering the competition…' : '🎃 Enter the Costume Competition'}
                </button>
                <div className="muted" style={{ fontSize: '.82rem' }}>
                  By registering, you agree that your name and costume photo can be shown to people using this party page.
                </div>
              </>
            )}
          </form>

          <section className="card stack">
            <div>
              <h2>How the fright night works</h2>
              <p className="muted"><strong>1.</strong> Register your costume. <strong>2.</strong> Keep this page on the same phone. <strong>3.</strong> When voting opens, pick the costume that deserves the crown.</p>
            </div>
            <div className="notice">🕸️ The leaderboard stays secret. Only the host can see the votes before the winner is revealed.</div>
          </section>
        </section>
      )}

      {!loading && me && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <div className="row space-between">
            <div>
              <div className="eyebrow">You survived registration 👻</div>
              <h2>{me.name}</h2>
            </div>
            <span className="badge open">Costume entered ✓</span>
          </div>

          {!settings.voting_open && !hasVoted ? (
            <div className="notice">🦇 Your costume is in. Voting is not open yet—come back on this same phone when the host starts the showdown.</div>
          ) : null}

          {hasVoted ? (
            <div className="notice success-text"><strong>Vote submitted.</strong> Results remain private until the host announces the winner.</div>
          ) : null}

          {settings.voting_open && !hasVoted ? (
            <div>
              <h2 style={{ marginBottom: 6 }}>🏆 Crown the best costume</h2>
              <p className="muted">Tap one photo. You cannot vote for yourself, and your vote cannot be changed.</p>
              {eligibleContestants.length === 0 ? (
                <div className="notice">No other costumes are available yet.</div>
              ) : (
                <div className="costume-grid">
                  {eligibleContestants.map((candidate) => (
                    <article className="costume selectable" key={candidate.id}>
                      <button type="button" onClick={() => handleVote(candidate)} disabled={voting}>
                        <img src={candidate.photoUrl} alt={`${candidate.name}'s costume`} />
                        <div className="meta">Vote for {candidate.name}</div>
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <div className="row space-between">
          <h2>🎃 The Costume Lineup</h2>
          <span className="muted">{contestants.length} registered</span>
        </div>
        <div className="costume-grid" style={{ marginTop: 12 }}>
          {contestants.map((contestant) => (
            <article className="costume" key={contestant.id}>
              <img src={contestant.photoUrl} alt={`${contestant.name}'s costume`} />
              <div className="meta">{contestant.name}</div>
            </article>
          ))}
        </div>
        {!contestants.length && !loading ? <div className="card muted" style={{ marginTop: 12 }}>No costumes have been registered yet.</div> : null}
      </section>

      <a className="admin-link" href="/admin">Party host / admin</a>
    </main>
  );
}
