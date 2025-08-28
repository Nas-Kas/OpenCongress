import { useEffect, useMemo, useState } from "react";

export default function BillPage({ congress, billType, billNumber, onBack, onOpenRoll }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  // Summaries
  const [summaries, setSummaries] = useState([]);
  const [sumErr, setSumErr] = useState(null);
  const [sumLoading, setSumLoading] = useState(true);

  // ---- fetch bill details + vote timeline ----
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(
      `http://127.0.0.1:8000/bill/${congress}/${String(billType).toLowerCase()}/${billNumber}`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [congress, billType, billNumber]);

  useEffect(() => {
    const ctrl = new AbortController();
    setSumLoading(true);
    setSumErr(null);
    setSummaries([]);

    fetch(
      `http://127.0.0.1:8000/bill/${congress}/${String(billType).toLowerCase()}/${billNumber}/summaries`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then((payload) => setSummaries(payload?.summaries || []))
      .catch((e) => { if (e.name !== "AbortError") setSumErr(String(e)); })
      .finally(() => setSumLoading(false));

    return () => ctrl.abort();
  }, [congress, billType, billNumber]);

  const votes = useMemo(() => (data?.votes ?? []), [data]);
  const orderedVotes = useMemo(() => {
    const arr = [...votes];
    arr.sort((a, b) => String(a.started || "").localeCompare(String(b.started || "")));
    return arr;
  }, [votes]);

  const latestSummary = useMemo(() => {
    if (!summaries || summaries.length === 0) return null;
    const sorted = [...summaries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return sorted[0];
  }, [summaries]);

  // ---- small UI helpers ----
  const resultBadge = (result) => {
    const s = (result || "").toLowerCase();
    const passed = s.includes("pass") || s.includes("agreed");
    const failed = s.includes("fail") || s.includes("reject");
    const bg = passed ? "#dcfce7" : failed ? "#fee2e2" : "#e5e7eb";
    return (
      <span style={{ background: bg, padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
        {result || "—"}
      </span>
    );
  };

  const countPills = (c = {}) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Pill color="#d1fae5">Yea {c.yea ?? 0}</Pill>
      <Pill color="#fee2e2">Nay {c.nay ?? 0}</Pill>
      <Pill color="#e5e7eb">Present {c.present ?? 0}</Pill>
      <Pill color="#fef3c7">NV {c.notVoting ?? 0}</Pill>
    </div>
  );

  if (loading) return <p>Loading bill…</p>;
  if (err) return <p style={{ color: "red" }}>Error: {err}</p>;
  if (!data) return <p>No data.</p>;

  const { bill } = data;
  const id = `${bill.billType?.toUpperCase()} ${bill.billNumber}`;
  const title = bill.title || id;

  return (
    <div style={{ padding: 4 }}>
      {/* Header */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        {onBack && <button onClick={onBack}>← Back</button>}
        <h2 style={{ margin: 0 }}>{title}</h2>
      </div>

      {/* Meta line */}
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

      {/* Latest action */}
      {bill.latestAction && (
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          Latest action: <em>{bill.latestAction?.text || bill.latestAction}</em>
          {bill.latestAction?.actionDate && ` (${bill.latestAction.actionDate})`}
        </div>
      )}

      {/* Text versions */}
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

      {/* --- Summary section (styled) --- */}
      <h3 style={{ marginTop: 16, marginBottom: 8 }}>Summary</h3>
      {sumLoading ? (
        <p>Loading summary…</p>
      ) : sumErr ? (
        <p style={{ color: "red" }}>Error loading summaries: {sumErr}</p>
      ) : !latestSummary ? (
        <p>No summary available.</p>
      ) : (
        <>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#fafafa"
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <Pill color="#eef2ff">{latestSummary.source || "CRS"}</Pill>
              {latestSummary.date && <Pill>{latestSummary.date}</Pill>}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
              {latestSummary.text}
            </div>
          </div>

          {summaries.length > 1 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>
                View all summaries ({summaries.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {[...summaries]
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                  .map((s, i) => (
                    <div key={`${s.date}-${i}`} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <Pill color="#eef2ff">{s.source || "CRS"}</Pill>
                        {s.date && <Pill>{s.date}</Pill>}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{s.text}</div>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* --- Timeline (styled like your member page) --- */}
      <h3 style={{ marginTop: 16, marginBottom: 8 }}>House Roll-Call Timeline</h3>
      {orderedVotes.length === 0 ? (
        <p>No recorded House votes for this bill (in DB).</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            cellPadding={8}
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: 14
            }}
          >
            <thead>
              <tr>
                <th align="left" style={{ fontWeight: 700 }}>Date</th>
                <th align="left" style={{ fontWeight: 700 }}>Session/Roll</th>
                <th align="left" style={{ fontWeight: 700 }}>Question</th>
                <th align="left" style={{ fontWeight: 700 }}>Chamber Result</th>
                <th align="left" style={{ fontWeight: 700 }}>Counts</th>
                <th align="left" style={{ fontWeight: 700 }}></th>
              </tr>
            </thead>
            <tbody>
              {orderedVotes.map((v) => (
                <tr key={`${v.session}-${v.roll}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td>{v.started?.slice(0, 10) ?? "—"}</td>
                  <td>#{v.roll} (S{v.session})</td>
                  <td style={{ minWidth: 260 }}>{v.question || "—"}</td>
                  <td>{resultBadge(v.result)}</td>
                  <td>{countPills(v.counts)}</td>
                  <td>
                    {onOpenRoll ? (
                      <button
                        onClick={() => onOpenRoll({ congress, session: v.session, roll: v.roll })}
                        title="Open this roll call"
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "white",
                          borderRadius: 8,
                          padding: "6px 10px",
                          cursor: "pointer"
                        }}
                      >
                        Open roll
                      </button>
                    ) : v.legislationUrl ? (
                      <a href={v.legislationUrl} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                        Clerk source
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pill({ children, color = "#e5e7eb" }) {
  return (
    <span
      style={{
        background: color,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600
      }}
    >
      {children}
    </span>
  );
}
