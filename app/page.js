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

function buildLightboxItems(items, metaBuilder) {
  return items
    .filter((item) => item?.photoUrl)
    .map((item, index) => ({
      id: item.id,
      src: item.photoUrl,
      title: item.name,
      subtitle: metaBuilder ? metaBuilder(item, index) : ''
    }));
}

export default function HomePage() {
  const [settings, setSettings] = useState({ party_name: 'Costume Party', registration_open: true, voting_open: false, results_visible: false });
  const [contestants, setContestants] = useState([]);
  const [publicResults, setPublicResults] = useState({ visible: false, totalVotes: 0, ranking: [] });
  const [me, setMe] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [voting, setVoting] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState({ items: [], index: 0, open: false });

  async function loadPublic() {
    try {
      const cacheBust = Date.now();
      const [settingsRes, contestantsRes, resultsRes] = await Promise.all([
        fetch(`/api/settings?_=${cacheBust}`, { cache: 'no-store' }),
        fetch(`/api/contestants?_=${cacheBust}`, { cache: 'no-store' }),
        fetch(`/api/results?_=${cacheBust}`, { cache: 'no-store' })
      ]);
      const settingsData = await readApiResponse(settingsRes);
      const contestantsData = await readApiResponse(contestantsRes);
      const resultsData = await readApiResponse(resultsRes);
      if (settingsRes.ok) setSettings(settingsData);
      if (contestantsRes.ok) setContestants(contestantsData.contestants || []);
      if (resultsRes.ok) {
        setPublicResults(resultsData);
        if (typeof resultsData.resultsVisible === 'boolean') {
          setSettings((current) => ({ ...current, results_visible: resultsData.resultsVisible }));
        } else if (resultsData.visible === true) {
          setSettings((current) => ({ ...current, results_visible: true }));
        }
      }
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

    const timer = window.setInterval(loadPublic, 8000);
    const refreshNow = () => loadPublic();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadPublic();
    };
    window.addEventListener('focus', refreshNow);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshNow);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
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

  useEffect(() => {
    if (!lightbox.open) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLightbox((current) => ({ ...current, open: false }));
      } else if (event.key === 'ArrowRight') {
        setLightbox((current) => ({
          ...current,
          index: current.items.length ? (current.index + 1) % current.items.length : 0
        }));
      } else if (event.key === 'ArrowLeft') {
        setLightbox((current) => ({
          ...current,
          index: current.items.length ? (current.index - 1 + current.items.length) % current.items.length : 0
        }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [lightbox.open]);

  const eligibleContestants = useMemo(
    () => contestants.filter((contestant) => contestant.id !== me?.id),
    [contestants, me]
  );

  const selectedCandidate = useMemo(
    () => eligibleContestants.find((contestant) => contestant.id === selectedCandidateId) || null,
    [eligibleContestants, selectedCandidateId]
  );

  const publicRanking = useMemo(() => {
    const byId = Object.fromEntries(contestants.map((contestant) => [contestant.id, contestant]));
    let previousVotes = null;
    let currentRank = 0;
    return (publicResults?.ranking || []).map((row, index) => {
      if (previousVotes === null || row.votes !== previousVotes) currentRank = index + 1;
      previousVotes = row.votes;
      return { ...row, rank: currentRank, photoUrl: byId[row.id]?.photoUrl || '' };
    });
  }, [contestants, publicResults]);

  const lineupLightboxItems = useMemo(
    () => buildLightboxItems(contestants, () => 'Registered costume entry'),
    [contestants]
  );

  const resultsLightboxItems = useMemo(
    () => buildLightboxItems(publicRanking, (row) => `Rank #${row.rank} • ${row.votes} vote${row.votes === 1 ? '' : 's'}`),
    [publicRanking]
  );

  function openLightbox(items, selectedId) {
    if (!items?.length) return;
    const startIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
    setLightbox({ items, index: startIndex >= 0 ? startIndex : 0, open: true });
  }

  function closeLightbox() {
    setLightbox((current) => ({ ...current, open: false }));
  }

  function moveLightbox(step) {
    setLightbox((current) => ({
      ...current,
      index: current.items.length ? (current.index + step + current.items.length) % current.items.length : 0
    }));
  }

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
      setSelectedCandidateId('');
      setMessage('Your vote has been recorded. The host will reveal the standings when the competition is over.');
    } catch (err) {
      setError(err.message || 'Vote could not be recorded.');
      await loadMe();
    } finally {
      setVoting(false);
    }
  }

  const showLineup = !publicResults?.visible && !(me && settings.voting_open);
  const activeLightboxItem = lightbox.items[lightbox.index];

  return (
    <main className="shell">
      <section className={`hero ${me ? 'hero-returning' : ''}`}>
        <div className="eyebrow">🎃 Julian&apos;s Halloween Party</div>
        <h1>Julian Halloween Party Costume Competition</h1>
        {!me ? (
          <>
            <p className="spooky-challenge">Only the scared ones won’t register. 👻</p>
            <div className="hero-quickline">🏆 Register for a chance at a <strong>HEFTY reward</strong> at the end of the party.</div>
          </>
        ) : (
          <div className="hero-quickline">🎭 You&apos;re entered. Keep this phone handy for voting.</div>
        )}
        <div className="status-strip" aria-label="Party status">
          <span className={settings.registration_open ? 'status-on' : ''}>Registration <strong>{settings.registration_open ? 'OPEN' : 'CLOSED'}</strong></span>
          <span className={settings.voting_open ? 'status-on' : ''}>Voting <strong>{settings.voting_open ? 'OPEN' : 'CLOSED'}</strong></span>
          <span className={settings.results_visible ? 'status-on' : ''}>Results <strong>{settings.results_visible ? 'LIVE' : 'HIDDEN'}</strong></span>
        </div>
      </section>

      {loading ? <div className="card compact">Loading party…</div> : null}
      {error ? <div className="notice error-text" role="alert">{error}</div> : null}
      {message ? <div className="notice success-text" role="status">{message}</div> : null}

      {!loading && !me && (
        <section className="registration-wrap" style={{ marginTop: 12 }}>
          <form className="card stack registration-card" onSubmit={handleRegister}>
            <div className="registration-heading">
              <h2>🎭 Enter the competition</h2>
              <p className="muted">Name + costume photo. That&apos;s it.</p>
            </div>

            {!settings.registration_open ? (
              <div className="notice">Registration is closed. Ask the party host if you still need to join.</div>
            ) : (
              <>
                <label>
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Your name" autoComplete="name" required />
                </label>

                <div className="stack photo-section">
                  <div className="field-title">Costume photo</div>
                  <div className="photo-actions">
                    <label className="btn photo-btn">
                      <span aria-hidden="true">📷</span> Take photo
                      <input
                        className="hidden"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoSelection}
                      />
                    </label>
                    <label className="btn secondary photo-btn">
                      <span aria-hidden="true">🖼️</span> Gallery
                      <input
                        className="hidden"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoSelection}
                      />
                    </label>
                  </div>
                  <div className="upload-note">JPG, PNG or WebP • large photos resize automatically</div>
                </div>

                {preview ? (
                  <div className="preview-row">
                    <div className="thumb-frame preview-frame">
                      <img className="preview preview-small" src={preview} alt="Your costume preview" />
                    </div>
                    <div><strong>Photo ready ✓</strong><div className="muted">Looking scary enough.</div></div>
                  </div>
                ) : null}

                <button className="btn primary-action" type="submit" disabled={registering}>
                  {registering ? 'Entering…' : '🎃 Register My Costume'}
                </button>

                <div className="keep-phone">📱 <strong>Keep this same phone.</strong> You&apos;ll use it to vote later.</div>
                <div className="mini-steps" aria-label="How it works">
                  <span><strong>1</strong> Register</span>
                  <span><strong>2</strong> Come back</span>
                  <span><strong>3</strong> Vote</span>
                </div>
                <div className="micro-copy">By registering, your name and costume photo can be shown on this party page.</div>
              </>
            )}
          </form>
        </section>
      )}

      {!loading && me && (
        <section className="card stack voter-card" style={{ marginTop: 12 }}>
          <div className="row space-between entry-summary">
            <div>
              <div className="eyebrow">You&apos;re entered ✓</div>
              <h2>{me.name}</h2>
            </div>
            <span className="badge open">Costume entered</span>
          </div>

          {!settings.voting_open && !hasVoted ? (
            <div className="notice compact-notice">🦇 Voting isn&apos;t open yet. Come back on this same phone when the host starts it.</div>
          ) : null}

          {hasVoted ? (
            <div className="notice success-text compact-notice"><strong>Vote submitted ✓</strong> Results stay hidden until the host reveals them.</div>
          ) : null}

          {settings.voting_open && !hasVoted ? (
            <div className="voting-panel">
              <div className="voting-heading">
                <div className="eyebrow">Voting is open</div>
                <h2>🏆 Pick the best costume</h2>
                <p className="muted">Tap a costume to select it. Use “View full photo” if you want a closer look before voting. You can&apos;t vote for yourself.</p>
              </div>

              {eligibleContestants.length === 0 ? (
                <div className="notice">No other costumes are available yet.</div>
              ) : (
                <div className="costume-grid voting-grid">
                  {eligibleContestants.map((candidate) => {
                    const selected = selectedCandidateId === candidate.id;
                    return (
                      <article className={`costume vote-card ${selected ? 'selected' : ''}`} key={candidate.id}>
                        <button
                          type="button"
                          className="vote-select-area"
                          onClick={() => setSelectedCandidateId(candidate.id)}
                          disabled={voting}
                          aria-pressed={selected}
                          aria-label={`Select ${candidate.name}'s costume for voting`}
                        >
                          <div className="thumb-frame">
                            <img src={candidate.photoUrl} alt={`${candidate.name}'s costume`} />
                          </div>
                          {selected ? <span className="selected-mark" aria-hidden="true">✓</span> : null}
                          <div className="meta">
                            <strong>{candidate.name}</strong>
                            <span>{selected ? 'Selected ✓' : 'Tap to select'}</span>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              {eligibleContestants.length > 0 ? (
                <div className={`vote-action ${selectedCandidate ? 'ready' : ''}`}>
                  <div className="vote-choice">
                    {selectedCandidate ? <>Your pick: <strong>{selectedCandidate.name}</strong></> : 'Choose one costume above'}
                  </div>
                  <button
                    className="btn vote-submit"
                    type="button"
                    onClick={() => selectedCandidate && handleVote(selectedCandidate)}
                    disabled={!selectedCandidate || voting}
                  >
                    {voting ? 'Submitting vote…' : selectedCandidate ? `Submit Vote for ${selectedCandidate.name}` : 'Select a costume first'}
                  </button>
                  <div className="vote-final-note">One vote only • cannot be changed</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      {publicResults?.visible ? (
        <section className="results-reveal card stack" style={{ marginTop: 18 }}>
          <div className="row space-between">
            <div>
              <div className="eyebrow">🏆 Final standings</div>
              <h2>The votes are in</h2>
            </div>
            <span className="badge open">{publicResults.totalVotes || 0} vote{publicResults.totalVotes === 1 ? '' : 's'}</span>
          </div>

          {!publicRanking.length ? (
            <div className="muted">No results to show yet.</div>
          ) : (
            <div className="ranking-list">
              {publicRanking.map((row) => (
                <article className={`ranking-row ${row.rank === 1 ? 'winner' : ''}`} key={row.id}>
                  <div className="rank-number">{row.rank === 1 ? '🏆' : `#${row.rank}`}</div>
                  {row.photoUrl ? (
                    <button
                      type="button"
                      className="ranking-photo-btn"
                      onClick={() => openLightbox(resultsLightboxItems, row.id)}
                      aria-label={`Open ${row.name}'s costume photo`}
                    >
                      <div className="thumb-frame ranking-thumb-frame">
                        <img src={row.photoUrl} alt={`${row.name}'s costume`} />
                      </div>
                    </button>
                  ) : null}
                  <div className="ranking-name"><strong>{row.name}</strong><span>{row.votes} vote{row.votes === 1 ? '' : 's'}</span></div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showLineup ? (
        <section className="lineup-section" style={{ marginTop: 20 }}>
          <div className="row space-between lineup-heading">
            <h2>🎃 Costume Lineup</h2>
            <span className="muted">{contestants.length} registered</span>
          </div>
          <div className="costume-grid lineup-grid" style={{ marginTop: 10 }}>
            {contestants.map((contestant) => (
              <article className="costume lineup-card" key={contestant.id}>
                <button
                  type="button"
                  className="image-open"
                  onClick={() => openLightbox(lineupLightboxItems, contestant.id)}
                  aria-label={`Open ${contestant.name}'s costume photo`}
                >
                  <div className="thumb-frame">
                    <img src={contestant.photoUrl} alt={`${contestant.name}'s costume`} />
                  </div>
                  <span className="zoom-badge" aria-hidden="true">⤢</span>
                </button>
                <div className="meta">{contestant.name}</div>
              </article>
            ))}
          </div>
          {!contestants.length && !loading ? <div className="card muted" style={{ marginTop: 10 }}>No costumes registered yet.</div> : null}
        </section>
      ) : null}

      <a className="admin-link" href="/admin">Party host / admin</a>

      {lightbox.open && activeLightboxItem ? (
        <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Costume photo viewer" onClick={closeLightbox}>
          <div className="lightbox-shell" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="lightbox-close" onClick={closeLightbox} aria-label="Close photo viewer">✕</button>
            {lightbox.items.length > 1 ? (
              <button type="button" className="lightbox-nav left" onClick={() => moveLightbox(-1)} aria-label="Previous photo">‹</button>
            ) : null}
            <div className="lightbox-stage">
              <div className="lightbox-image-wrap">
                <img src={activeLightboxItem.src} alt={activeLightboxItem.title} className="lightbox-image" />
              </div>
              <div className="lightbox-caption">
                <strong>{activeLightboxItem.title}</strong>
                {activeLightboxItem.subtitle ? <span>{activeLightboxItem.subtitle}</span> : null}
              </div>
            </div>
            {lightbox.items.length > 1 ? (
              <button type="button" className="lightbox-nav right" onClick={() => moveLightbox(1)} aria-label="Next photo">›</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
