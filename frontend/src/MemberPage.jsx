import { useEffect, useState } from "react";

export default function MemberPage({ bioguideId, congress = 119, session = 1 }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(
      `http://127.0.0.1:8000/member/${bioguideId}/house-votes?congress=${congress}&session=${session}&window=50`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setErr(String(e));
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [bioguideId, congress, session]);

  if (loading) return <p>Loading member…</p>;
  if (err) return <p style={{color:'red'}}>Error: {err}</p>;
  if (!data) return <p>No data.</p>;

  const { profile, stats, votes } = data;

  return (
    <div style={{ padding: 4 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        {profile?.imageUrl && (
          <img
            src={profile.imageUrl}
            alt={profile.name}
            width={48}
            height={48}
            style={{ borderRadius: 6 }}
          />
        )}
        <div>
          <h2 style={{ margin: 0 }}>{profile?.name}</h2>
          <div style={{ color: '#444' }}>
            {profile?.party} • {profile?.state} • {profile?.bioguideId}
          </div>
          {stats && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              Yea: {stats.yea} · Nay: {stats.nay} · Present: {stats.present} · Not Voting: {stats.notVoting} · Total: {stats.total}
            </div>
          )}
        </div>
      </header>

      {(!votes || votes.length === 0) ? (
        <p>No recorded votes found in the selected window.</p>
      ) : (
        <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th align="left">Roll</th>
              <th align="left">Bill</th>
              <th align="left">Question</th>
              <th align="left">Chamber Result</th>
              <th align="left">Member Vote</th>
              <th align="left">Date</th>
            </tr>
          </thead>
          <tbody>
            {votes.map((v) => (
              <tr key={v.roll}>
                <td>#{v.roll}</td>
                <td>
                  {v.legislationUrl ? (
                    <a
                      href={v.legislationUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#1d4ed8", textDecoration: "underline" }}
                    >
                      {v.title
                        ? `${v.title} — ${v.legislationType} ${v.legislationNumber}`
                        : `${v.legislationType ?? ""} ${v.legislationNumber ?? ""}`.trim()}
                    </a>
                  ) : (
                    v.title
                      ? `${v.title} — ${v.legislationType} ${v.legislationNumber}`
                      : `${v.legislationType ?? ""} ${v.legislationNumber ?? ""}`.trim()
                  )}
                </td>
                <td>{v.question || ""}</td>
                <td>{v.result}</td>
                <td>
                  <span style={{
                    padding: "2px 6px",
                    background: v.position === 'Yea' ? '#d1fae5'
                             : v.position === 'Nay' ? '#fee2e2'
                             : v.position === 'Present' ? '#e5e7eb'
                             : '#fef3c7',
                    borderRadius: 6,
                    display: "inline-block"
                  }}>
                    {v.position || '—'}
                  </span>
                </td>
                <td>{v.started?.slice(0,10) ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
