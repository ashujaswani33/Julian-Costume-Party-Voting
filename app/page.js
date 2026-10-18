'use client';

import { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'costume_party_voter_token';

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
      const settingsData = await settingsRes.json();
      const contestantsData = await contestantsRes.json();
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
      const data = await res.json();
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
      const data = await res.json();
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
      const data = await res.json();
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
        <div className="eyebrow">Scan • Register • Vote</div>
        <h1>{settings.party_name}</h1>
        <p className="muted">Upload your costume photo, then come back on the same phone when voting opens.</p>
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
              <h2>Register your costume</h2>
              <p className="muted">Use the same phone later for voting.</p>
            </div>

            {!settings.registration_open ? (
              <div className="notice">Registration is closed. Ask the party host if you still need to join.</div>
            ) : (
              <>
                <label>
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Example: Alex" autoComplete="name" required />
                </label>

                <label>
                  Costume photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                    required
                  />
                </label>

                <div className="muted" style={{ fontSize: '.88rem' }}>JPG, PNG, or WebP. Maximum 8 MB.</div>
                {preview ? <img className="preview" src={preview} alt="Your costume preview" /> : null}

                <button className="btn" type="submit" disabled={registering}>
                  {registering ? 'Registering…' : 'Register for the party'}
                </button>
                <div className="muted" style={{ fontSize: '.82rem' }}>
                  By registering, you agree that your name and costume photo can be shown to people using this party page.
                </div>
              </>
            )}
          </form>

          <section className="card stack">
            <div>
              <h2>How it works</h2>
              <p className="muted">1. Register once. 2. Keep this page on the same phone. 3. When the host opens voting, choose your favorite costume.</p>
            </div>
            <div className="notice">Guests never see vote totals or the current leader.</div>
          </section>
        </section>
      )}

      {!loading && me && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <div className="row space-between">
            <div>
              <div className="eyebrow">Registered</div>
              <h2>{me.name}</h2>
            </div>
            <span className="badge open">Ready to vote</span>
          </div>

          {!settings.voting_open && !hasVoted ? (
            <div className="notice">Voting is not open yet. Keep this page bookmarked or scan the same QR code again later on this phone.</div>
          ) : null}

          {hasVoted ? (
            <div className="notice success-text"><strong>Vote submitted.</strong> Results remain private until the host announces the winner.</div>
          ) : null}

          {settings.voting_open && !hasVoted ? (
            <div>
              <h2 style={{ marginBottom: 6 }}>Choose the best costume</h2>
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
          <h2>Costumes</h2>
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
