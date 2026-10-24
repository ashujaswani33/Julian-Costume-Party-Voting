'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const SAFE_UPLOAD_BYTES = 3 * 1024 * 1024;

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

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [demoCount, setDemoCount] = useState(12);
  const [manualName, setManualName] = useState('');
  const [manualPhoto, setManualPhoto] = useState(null);
  const [manualPreview, setManualPreview] = useState('');

  useEffect(() => {
    async function loadSiteUrl() {
      try {
        const res = await fetch('/api/site-url', { cache: 'no-store' });
        const result = await res.json();
        setSiteUrl(result.url || window.location.origin);
      } catch {
        setSiteUrl(window.location.origin);
      }
    }
    loadSiteUrl();
    loadResults(false);
  }, []);

  useEffect(() => {
    if (!manualPhoto) {
      setManualPreview('');
      return;
    }
    const previewUrl = URL.createObjectURL(manualPhoto);
    setManualPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [manualPhoto]);

  const ranking = useMemo(() => {
    return [...(data?.contestants || [])].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  }, [data]);

  const leaders = useMemo(() => {
    if (!ranking.length || ranking[0].votes === 0) return [];
    return ranking.filter((row) => row.votes === ranking[0].votes);
  }, [ranking]);

  const adminRegisteredCount = useMemo(() => {
    return (data?.contestants || []).filter((row) => row.adminRegistered).length;
  }, [data]);

  async function loadResults(showError = true) {
    try {
      const res = await fetch('/api/admin/results', { cache: 'no-store' });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not load results.');
      setAuthenticated(true);
      setData(result);
      setError('');
    } catch (err) {
      if (showError) setError(err.message || 'Could not load results.');
    }
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Sign in failed.');
      setPassword('');
      setAuthenticated(true);
      await loadResults();
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function updateSettings(patch, successMessage) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not update settings.');
      setMessage(successMessage);
      await loadResults();
    } catch (err) {
      setError(err.message || 'Could not update settings.');
    } finally {
      setBusy(false);
    }
  }

  async function clearVotes() {
    if (!window.confirm('Clear every vote? Registered guests and photos will stay.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/reset-votes', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not clear votes.');
      setMessage('All votes were cleared.');
      await loadResults();
    } catch (err) {
      setError(err.message || 'Could not clear votes.');
    } finally {
      setBusy(false);
    }
  }

  async function createDemoData() {
    const count = Math.max(5, Math.min(50, Number.parseInt(String(demoCount), 10) || 12));
    if (!window.confirm(`Create ${count} DEMO contestants and random votes? Existing DEMO entries will be replaced. Real guests will not be changed.`)) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/demo-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not create demo data.');
      setMessage(result.message || `Created ${count} demo entries.`);
      await loadResults();
    } catch (err) {
      setError(err.message || 'Could not create demo data.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDemoData() {
    if (!window.confirm('Remove all DEMO contestants, their demo photos, and their votes? Real guests will stay.')) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/demo-data', { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not remove demo data.');
      setMessage(result.message || 'Demo data removed.');
      await loadResults();
    } catch (err) {
      setError(err.message || 'Could not remove demo data.');
    } finally {
      setBusy(false);
    }
  }

  async function handleManualPhotoSelection(event) {
    const selected = event.target.files?.[0] || null;
    setError('');
    if (!selected) return;
    try {
      const optimized = await compressCostumePhoto(selected);
      setManualPhoto(optimized);
      if (optimized.size < selected.size) {
        setMessage('Large photo optimized automatically. Ready to add this guest.');
      }
    } catch (err) {
      setManualPhoto(null);
      event.target.value = '';
      setError(err.message || 'Please choose a different photo.');
    }
  }

  async function registerManualGuest(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!manualName.trim() || !manualPhoto) {
      setError('Please enter the guest name and choose a costume photo.');
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append('name', manualName.trim());
      form.append('photo', manualPhoto);
      const res = await fetch('/api/admin/register-child', {
        method: 'POST',
        body: form
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not add guest.');

      setManualName('');
      setManualPhoto(null);
      setManualPreview('');
      setMessage(result.message || `${result.contestant?.name || 'Guest'} added successfully.`);
      await loadResults();
    } catch (err) {
      setError(err.message || 'Could not add guest.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthenticated(false);
    setData(null);
  }

  function printQr() {
    window.print();
  }

  if (!authenticated) {
    return (
      <main className="shell">
        <section className="hero">
          <div className="eyebrow">Private area</div>
          <h1>Admin</h1>
          <p className="muted">Only the party host can see vote totals and control voting.</p>
        </section>

        <form className="card stack" onSubmit={login} style={{ maxWidth: 480 }}>
          <label>
            Admin password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error ? <div className="error-text" role="alert">{error}</div> : null}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <a className="muted" href="/">Back to guest page</a>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="row space-between">
          <div>
            <div className="eyebrow">Host controls</div>
            <h1 style={{ fontSize: 'clamp(2rem, 7vw, 4rem)' }}>{data?.settings?.party_name || 'Costume Party'}</h1>
          </div>
          <button className="btn secondary" type="button" onClick={logout}>Log out</button>
        </div>
      </section>

      {error ? <div className="notice error-text" role="alert">{error}</div> : null}
      {message ? <div className="notice success-text" role="status">{message}</div> : null}

      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="card stack">
          <h2>Party controls</h2>
          <div className="row">
            <span className={`badge ${data?.settings?.registration_open ? 'open' : ''}`}>
              Registration {data?.settings?.registration_open ? 'open' : 'closed'}
            </span>
            <span className={`badge ${data?.settings?.voting_open ? 'open' : ''}`}>
              Voting {data?.settings?.voting_open ? 'open' : 'closed'}
            </span>
            <span className={`badge ${data?.settings?.results_visible ? 'open' : ''}`}>
              Guest results {data?.settings?.results_visible ? 'visible' : 'hidden'}
            </span>
          </div>
          <div className="row">
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => updateSettings({ registrationOpen: !data.settings.registration_open }, data.settings.registration_open ? 'Registration closed.' : 'Registration opened.')}
            >
              {data?.settings?.registration_open ? 'Close registration' : 'Open registration'}
            </button>
            <button
              className={data?.settings?.voting_open ? 'btn secondary' : 'btn success'}
              type="button"
              disabled={busy}
              onClick={() => updateSettings({ votingOpen: !data.settings.voting_open }, data.settings.voting_open ? 'Voting closed. Results are still hidden until you reveal them.' : 'Voting opened. Guest results were hidden automatically.')}
            >
              {data?.settings?.voting_open ? 'Close voting' : 'Open voting'}
            </button>
            <button
              className={data?.settings?.results_visible ? 'btn secondary' : 'btn success'}
              type="button"
              disabled={busy || data?.settings?.voting_open}
              title={data?.settings?.voting_open ? 'Close voting before revealing results.' : ''}
              onClick={() => updateSettings({ resultsVisible: !data.settings.results_visible }, data.settings.results_visible ? 'Results hidden from guests.' : 'Final standings are now visible to guests.')}
            >
              {data?.settings?.results_visible ? 'Hide Results from Guests' : 'Show Results to Guests'}
            </button>
            <button className="btn danger" type="button" disabled={busy} onClick={clearVotes}>Clear votes</button>
          </div>
          <div className="muted" style={{ fontSize: '.88rem' }}>Tip: close registration before voting. When voting ends, click <strong>Show Results to Guests</strong> to reveal the ranking and vote counts. The who-voted-for-whom table stays private.</div>
        </div>

        <div className="card stack">
          <h2>Guest QR code</h2>
          <p className="muted">Print this or display it at the entrance. It points to the guest page.</p>
          {siteUrl ? <div className="qr-box"><QRCodeSVG value={siteUrl} size={220} level="M" /></div> : null}
          <div style={{ overflowWrap: 'anywhere' }}>{siteUrl}</div>
          <button className="btn secondary" type="button" onClick={printQr}>Print this page</button>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="muted">Registered guests</div>
          <div className="big-number">{data?.contestants?.length || 0}</div>
        </div>
        <div className="card">
          <div className="muted">Votes received</div>
          <div className="big-number">{data?.totalVotes || 0}</div>
        </div>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <div>
          <div className="eyebrow">Admin helper</div>
          <h2>Register guest without phone</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Use this for kids or guests who do not have their own phone. They will appear in the competition and can receive votes, but they will not cast a vote unless you later register them on a phone.</p>
        </div>

        <form className="stack" onSubmit={registerManualGuest}>
          <label>
            Guest name
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} maxLength={50} placeholder="Child or guest name" disabled={busy} required />
          </label>

          <div className="stack photo-section">
            <div className="field-title">Costume photo</div>
            <div className="photo-actions">
              <label className="btn photo-btn">
                <span aria-hidden="true">📷</span> Take photo
                <input className="hidden" type="file" accept="image/*" capture="environment" onChange={handleManualPhotoSelection} disabled={busy} />
              </label>
              <label className="btn secondary photo-btn">
                <span aria-hidden="true">🖼️</span> Gallery
                <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleManualPhotoSelection} disabled={busy} />
              </label>
            </div>
            <div className="upload-note">JPG, PNG or WebP • large photos resize automatically</div>
          </div>

          {manualPreview ? (
            <div className="preview-row">
              <img className="preview-small" src={manualPreview} alt="Guest costume preview" />
              <div>
                <strong>Photo ready ✓</strong>
                <div className="muted">This entry will be marked privately as Admin registered / No phone.</div>
              </div>
            </div>
          ) : null}

          <div className="row" style={{ alignItems: 'end' }}>
            <button className="btn success" type="submit" disabled={busy}>
              {busy ? 'Adding guest…' : 'Add Guest Without Phone'}
            </button>
            <div className="muted" style={{ fontSize: '.84rem' }}>{adminRegisteredCount} admin-added guest{adminRegisteredCount === 1 ? '' : 's'} currently in the competition.</div>
          </div>
        </form>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <div>
          <div className="eyebrow">Testing tools</div>
          <h2>Demo party data</h2>
          <p className="muted" style={{ marginBottom: 0 }}>Generate realistic fake contestants, Halloween demo pictures, and random votes so you can preview the admin and guest result screens. Demo entries are clearly labeled <strong>DEMO</strong> and can be removed without deleting real guests.</p>
        </div>

        <div className="row" style={{ alignItems: 'end' }}>
          <label style={{ width: 170 }}>
            Demo entries (5–50)
            <input
              type="number"
              min="5"
              max="50"
              value={demoCount}
              onChange={(event) => setDemoCount(event.target.value)}
              disabled={busy}
            />
          </label>
          <button className="btn success" type="button" disabled={busy} onClick={createDemoData}>
            {busy ? 'Working…' : 'Create Demo Data'}
          </button>
          <button className="btn secondary" type="button" disabled={busy} onClick={removeDemoData}>
            Remove Demo Data
          </button>
        </div>
        <div className="muted" style={{ fontSize: '.84rem' }}>Creating demo data replaces only previous DEMO entries. It does not change real registrations. Each demo contestant casts one random vote for another demo contestant.</div>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <div>
          <div className="eyebrow">Private results</div>
          <h2>Current winner</h2>
        </div>
        {!leaders.length ? (
          <div className="muted">No votes yet.</div>
        ) : leaders.length === 1 ? (
          <div><span className="big-number">🏆 {leaders[0].name}</span><div className="muted">{leaders[0].votes} vote{leaders[0].votes === 1 ? '' : 's'}</div></div>
        ) : (
          <div><span className="big-number">Tie</span><div>{leaders.map((leader) => leader.name).join(', ')}</div><div className="muted">{leaders[0].votes} votes each</div></div>
        )}
      </section>

      <section className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Rank</th><th>Costume</th><th>Votes</th><th>Share</th></tr></thead>
          <tbody>
            {ranking.map((row, index) => {
              const share = data.totalVotes ? Math.round((row.votes / data.totalVotes) * 100) : 0;
              return (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{row.name}</strong>
                    {row.adminRegistered ? <div className="muted" style={{ fontSize: '.78rem' }}>Admin registered / No phone</div> : null}
                  </td>
                  <td>{row.votes}</td>
                  <td>{share}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        <div>
          <div className="eyebrow">Admin only</div>
          <h2>Who voted for whom</h2>
          <p className="muted">This detailed vote trail is visible only after admin sign-in. Guests never receive it.</p>
        </div>

        {!data?.voteDetails?.length ? (
          <div className="muted">No votes have been cast yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Voter</th><th>Voted for</th><th>Time</th></tr></thead>
              <tbody>
                {data.voteDetails.map((vote, index) => (
                  <tr key={`${vote.voterId}-${index}`}>
                    <td><strong>{vote.voterName}</strong></td>
                    <td>{vote.candidateName}</td>
                    <td>{vote.createdAt ? new Date(vote.createdAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <a className="admin-link" href="/">Open guest page</a>
    </main>
  );
}
