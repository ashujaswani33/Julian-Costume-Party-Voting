'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSiteUrl(window.location.origin);
    loadResults(false);
  }, []);

  const ranking = useMemo(() => {
    return [...(data?.contestants || [])].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  }, [data]);

  const leaders = useMemo(() => {
    if (!ranking.length || ranking[0].votes === 0) return [];
    return ranking.filter((row) => row.votes === ranking[0].votes);
  }, [ranking]);

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
              onClick={() => updateSettings({ votingOpen: !data.settings.voting_open }, data.settings.voting_open ? 'Voting closed.' : 'Voting opened.')}
            >
              {data?.settings?.voting_open ? 'Close voting' : 'Open voting'}
            </button>
            <button className="btn danger" type="button" disabled={busy} onClick={clearVotes}>Clear votes</button>
          </div>
          <div className="muted" style={{ fontSize: '.88rem' }}>Tip: close registration before opening voting so the contestant list stays fixed.</div>
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
              return <tr key={row.id}><td>{index + 1}</td><td><strong>{row.name}</strong></td><td>{row.votes}</td><td>{share}%</td></tr>;
            })}
          </tbody>
        </table>
      </section>

      <a className="admin-link" href="/">Open guest page</a>
    </main>
  );
}
