import { useEffect, useState } from "react";

export default function BillPage({ congress, billType, billNumber, onBack, onOpenRoll }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(`http://127.0.0.1:8000/bill/${congress}/${billType.toLowerCase()}/${billNumber}`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [congress, billType, billNumber]);

  if (loading) return <p>Loading bill…</p>;
  if (err) return <p style={{ color: "red" }}>Error: {err}</p>;
  if (!data) return <p>No data.</p>;

  const { bill, votes } = data;

  const id = `${bill.billType?.toUpperCase()} ${bill.billNumber}`;
  const title = bill.title || id;

  return (
    <div style={{ padding: 4 }}>
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        {onBack && <button onClick={onBack}>← Back</button>}
        <h2 style={{ margin: 0 }}>{title}</h2>
      </div>

      <div style={{ fontSize: 14, color: "#444", marginBottom: 8 }}>
        <strong>{id}</strong>
        {" · "}Introduced: {bill.introducedDate?.slice(0, 10) || "—"}
        {bill.publicUrl && (
          <>
            {" · "}
            <a href={bill.publicUrl} target="_blank" rel="noreferrer">Congress.gov page</a>
          </>
        )}
      </div>

      {bill.latestAction && (
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          Latest action: <em>{bill.latestAction?.text || bill.latestAction}</em>
          {bill.latestAction?.actionDate && ` (${bill.latestAction.actionDate})`}
        </div>
      )}

      {bill.textVersions && bill.textVersions.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          Text versions:&nbsp;
          {bill.textVersions.map((tv, i) => (
            <span key={`${tv.type}-${i}`}>
              <a href={tv.url} target="_blank" rel="noreferrer">{tv.type}</a>
              {i < bill.textVersions.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>House Roll-Call Timeline</h3>
      {(!votes || votes.length === 0) ? (
        <p>No recorded House votes for this bill (in DB).</p>
      ) : (
        <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="left">Session/Roll</th>
              <th align="left">Question</th>
              <th align="left">Result</th>
              <th align="left">Counts</th>
              <th align="left"></th>
            </tr>
          </thead>
          <tbody>
            {votes.map(v => (
              <tr key={`${v.session}-${v.roll}`}>
                <td>{v.started?.slice(0,10) ?? "—"}</td>
                <td>#{v.roll} (S{v.session})</td>
                <td>{v.question || "—"}</td>
                <td>{v.result || "—"}</td>
                <td style={{ color: "#444" }}>
                  Y:{v.counts?.yea ?? 0} · N:{v.counts?.nay ?? 0} · P:{v.counts?.present ?? 0} · NV:{v.counts?.notVoting ?? 0}
                </td>
                <td>
                  {onOpenRoll ? (
                    <button
                      onClick={() => onOpenRoll({ congress, session: v.session, roll: v.roll })}
                      title="Open this roll call"
                    >
                      Open roll
                    </button>
                  ) : v.legislationUrl ? (
                    <a href={v.legislationUrl} target="_blank" rel="noreferrer">Clerk source</a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
