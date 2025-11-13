import { useEffect, useMemo, useState } from "react";

const TOKENS = {
  radius: 10,
  border: "#E5E7EB",
  borderSubtle: "#EEF2F7",
  text: "#111827",
  textMuted: "#6B7280",
  cardBg: "#FFFFFF",
  pageBg: "#F7F9FC",
  shadow: "0 1px 2px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.04)",
  badge: {
    passBg: "#E9F8EE",
    passFg: "#0B7A45",
    failBg: "#FDECEC",
    failFg: "#B42318",
    otherBg: "#F2F4F7",
    otherFg: "#344054",
    yBg: "#EAF8F0",
    yFg: "#15803D",
    nBg: "#FDEEEE",
    nFg: "#B91C1C",
    pBg: "#F2F4F7",
    pFg: "#475467",
    nvBg: "#FEF6E7",
    nvFg: "#92400E",
  },
  btn: {
    primaryBg: "#2563EB",
    primaryBgHover: "#1E4ED8",
    primaryFg: "#FFFFFF",
    secondaryBorder: "#E5E7EB",
    secondaryHover: "#F8FAFC",
  },
};


function classifyResult(result) {
  const s = (result || "").toLowerCase();
  if (s.includes("pass") || s.includes("agreed")) return "passed";
  if (s.includes("fail") || s.includes("reject")) return "failed";
  return "other";
}

function getCounts(v = {}) {
  if (v.counts && typeof v.counts === "object") return v.counts;
  return {
    yea: v.yeaCount ?? 0,
    nay: v.nayCount ?? 0,
    present: v.presentCount ?? 0,
    notVoting: v.notVotingCount ?? 0,
  };
}

function ResultBadge({ result }) {
  const cls = classifyResult(result);
  const bg =
    cls === "passed" ? TOKENS.badge.passBg :
    cls === "failed" ? TOKENS.badge.failBg : TOKENS.badge.otherBg;
  const fg =
    cls === "passed" ? TOKENS.badge.passFg :
    cls === "failed" ? TOKENS.badge.failFg : TOKENS.badge.otherFg;
  return (
    <span style={{
      background: bg, color: fg, padding: "4px 10px",
      borderRadius: 999, fontSize: 12, fontWeight: 700
    }}>
      {result || "—"}
    </span>
  );
}

function CountChip({ label, value, bg, fg }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: bg,
      color: fg,
      borderRadius: 999,
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <span>{value ?? 0}</span>
    </span>
  );
}

function Counts({ c }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <CountChip label="Y" value={c.yea} bg={TOKENS.badge.yBg} fg={TOKENS.badge.yFg} />
      <CountChip label="N" value={c.nay} bg={TOKENS.badge.nBg} fg={TOKENS.badge.nFg} />
      <CountChip label="P" value={c.present} bg={TOKENS.badge.pBg} fg={TOKENS.badge.pFg} />
      <CountChip label="NV" value={c.notVoting} bg={TOKENS.badge.nvBg} fg={TOKENS.badge.nvFg} />
    </div>
  );
}


export default function VotedBillsTable({
  congress = 119,
  session = 1,
  onSelectVote,
  onSelectBill,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [fRes, setFRes] = useState("all");
  const [fType, setFType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [density, setDensity] = useState("compact"); // "compact" | "comfortable"

  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);
    fetch(
      `http://127.0.0.1:8000/house/votes?congress=${congress}&session=${session}&window=200`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [congress, session]);

  const votes = useMemo(() => data?.votes ?? [], [data]);

  const uniqueTypes = useMemo(() => {
    const s = new Set();
    for (const v of votes) if (v.legislationType) s.add(v.legislationType);
    return Array.from(s);
  }, [votes]);

  const filtered = useMemo(() => {
    let list = votes;

    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (v) =>
          (v.title || "").toLowerCase().includes(needle) ||
          (v.question || "").toLowerCase().includes(needle) ||
          (v.legislationType || "").toLowerCase().includes(needle) ||
          String(v.legislationNumber || "").includes(needle)
      );
    }
    if (fRes !== "all") list = list.filter((v) => classifyResult(v.result) === fRes);
    if (fType !== "all") list = list.filter((v) => (v.legislationType || "") === fType);
    if (from) list = list.filter((v) => (v.started || "").slice(0, 10) >= from);
    if (to) list = list.filter((v) => (v.started || "").slice(0, 10) <= to);

    list = [...list].sort((a, b) =>
      String(b.started || "").localeCompare(String(a.started || ""))
    );
    return list;
  }, [votes, q, fRes, fType, from, to]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const v of filtered) {
      const type = (v.legislationType || "").trim();
      const num = String(v.legislationNumber || "").trim();
      const key = type && num ? `${type}::${num}` : `title::${(v.title || "").trim()}`;
      if (!map.has(key)) {
        map.set(key, { key, billType: type || null, billNumber: num || null, title: (v.title || "").trim(), votes: [] });
      }
      map.get(key).votes.push(v);
    }
    const arr = Array.from(map.values()).map((g) => {
      const sorted = [...g.votes].sort((a, b) =>
        String(b.started || "").localeCompare(String(a.started || ""))
      );
      return { ...g, latest: sorted[0], votes: sorted };
    });
    arr.sort((a, b) =>
      String(b.latest?.started || "").localeCompare(String(a.latest?.started || ""))
    );
    return arr;
  }, [filtered]);

  if (loading) return <div style={{ padding: 12, color: TOKENS.textMuted }}>Loading voted bills…</div>;
  if (err) return <div style={{ padding: 12, color: "#B42318" }}>Error: {err}</div>;

  const padY = density === "compact" ? 8 : 12;

  return (
    <div style={{ background: TOKENS.pageBg, padding: 8, borderRadius: TOKENS.radius }}>
      {/* Controls */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px,1fr) 180px 160px 150px 150px 120px",
        gap: 8, alignItems: "center", marginBottom: 8
      }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title, question, type, or number…"
          style={inputStyle}
        />
        <select value={fRes} onChange={(e) => setFRes(e.target.value)} style={selectStyle}>
          <option value="all">Any result</option>
          <option value="passed">Passed/Agreed</option>
          <option value="failed">Failed/Rejected</option>
          <option value="other">Other</option>
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={selectStyle}>
          <option value="all">All bill types</option>
          {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle} />
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <DensityToggle value={density} onChange={setDensity} />
          {(q || fRes !== "all" || fType !== "all" || from || to) && (
            <button
              onClick={() => { setQ(""); setFRes("all"); setFType("all"); setFrom(""); setTo(""); }}
              style={secBtn}
              title="Clear all filters"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Summary line */}
      <div style={{ margin: "6px 2px 10px", fontSize: 12, color: TOKENS.textMuted }}>
        Showing <strong>{groups.reduce((acc, g) => acc + g.votes.length, 0)}</strong> votes across{" "}
        <strong>{groups.length}</strong> bills
      </div>

      {/* Groups */}
      <div style={{ display: "grid", gap: 10 }}>
        {groups.map((g) => {
          const latestCounts = getCounts(g.latest || {});
          const isOpen = open.has(g.key);
          return (
            <div
              key={g.key}
              style={{
                background: TOKENS.cardBg,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: TOKENS.radius,
                boxShadow: TOKENS.shadow,
                overflow: "hidden",
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px minmax(260px,1fr) 340px 1fr 150px",
                  alignItems: "center",
                  gap: 12,
                  padding: `${padY}px 12px`,
                  borderBottom: `1px solid ${TOKENS.borderSubtle}`,
                }}
              >
                <button
                  onClick={() => {
                    const n = new Set(open);
                    if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                    setOpen(n);
                  }}
                  title={isOpen ? "Hide roll calls" : "Show roll calls"}
                  style={chevBtn}
                >
                  {isOpen ? "▾" : "▸"}
                </button>

                <div style={{ minWidth: 0 }}>
                  {g.billType && g.billNumber ? (
                    <button
                      onClick={() => onSelectBill?.({
                        congress,
                        billType: g.billType.toLowerCase(),
                        billNumber: g.billNumber
                      })}
                      style={titleLink}
                    >
                      {g.title || `${g.billType} ${g.billNumber}`}
                    </button>
                  ) : (
                    <span style={{ color: TOKENS.text }}>{g.title || "(Untitled bill)"}</span>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {g.billType && g.billNumber && (
                      <span style={miniTag}>{g.billType} {g.billNumber}</span>
                    )}
                    {g.latest?.started && (
                      <span style={miniMuted}>{String(g.latest.started).slice(0,10)}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <ResultBadge result={g.latest?.result} />
                  <Counts c={latestCounts} />
                </div>

                {/* tiny outcome spark */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  {g.votes.slice(0, 8).map((v) => (
                    <span key={v.roll} title={`#${v.roll} • ${v.question || ""}`} style={{
                      width: 9, height: 9, borderRadius: 2, display: "inline-block",
                      background:
                        classifyResult(v.result) === "passed" ? "#86efac" :
                        classifyResult(v.result) === "failed" ? "#fca5a5" : "#d1d5db"
                    }} />
                  ))}
                  {g.votes.length > 8 && (
                    <span style={{ color: TOKENS.textMuted, fontSize: 12 }}>+{g.votes.length - 8}</span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      const v = g.latest; if (!v) return;
                      onSelectVote?.({
                        congress, session, roll: v.roll,
                        title: v.title,
                        legislationType: v.legislationType,
                        legislationNumber: v.legislationNumber
                      });
                    }}
                    style={primaryBtn}
                  >
                    Open latest roll
                  </button>
                </div>
              </div>

              {/* Expanded table */}
              {isOpen && (
                <div style={{ padding: 10, background: "#FBFCFE" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table cellPadding={0} style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead style={{ position: "sticky", top: 0, background: "#FBFCFE", zIndex: 1 }}>
                        <tr>
                          {["Roll", "Question", "Result", "Counts", "Date", ""].map((h, i) => (
                            <th key={i} align={i === 5 ? "right" : "left"} style={headCell}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.votes.map((v, idx) => {
                          const c = getCounts(v);
                          const zebra = idx % 2 === 1 ? { background: "#F7F9FD" } : null;
                          return (
                            <tr key={v.roll} style={{ borderTop: `1px solid ${TOKENS.borderSubtle}`, ...zebra }}>
                              <td style={cell}>#{v.roll}</td>
                              <td style={{ ...cell, minWidth: 280 }}>{v.question || "—"}</td>
                              <td style={cell}><ResultBadge result={v.result} /></td>
                              <td style={cell}><Counts c={c} /></td>
                              <td style={cell}>{String(v.started || "").slice(0,10)}</td>
                              <td style={{ ...cell, textAlign: "right" }}>
                                <button
                                  onClick={() => onSelectVote?.({ congress, session, roll: v.roll, title: v.title })}
                                  style={rowBtn}
                                >
                                  Open roll
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function DensityToggle({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${TOKENS.border}`, borderRadius: 999, overflow: "hidden" }}>
      {["compact", "comfortable"].map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              background: active ? "#EEF2FF" : "#FFFFFF",
              color: active ? "#1D4ED8" : TOKENS.text,
              border: "none",
              cursor: "pointer"
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}


const inputStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${TOKENS.border}`,
  background: "#fff",
};

const selectStyle = { ...inputStyle };

const primaryBtn = {
  border: `1px solid ${TOKENS.btn.primaryBg}`,
  background: TOKENS.btn.primaryBg,
  color: TOKENS.btn.primaryFg,
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};
const secBtn = {
  border: `1px solid ${TOKENS.btn.secondaryBorder}`,
  background: "#fff",
  color: TOKENS.text,
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};
const rowBtn = { ...secBtn, padding: "6px 10px" };

const chevBtn = {
  height: 28, width: 28, borderRadius: 8,
  border: `1px solid ${TOKENS.border}`, background: "#fff", cursor: "pointer"
};

const titleLink = {
  border: 0, background: "transparent", padding: 0, cursor: "pointer",
  color: "#1D4ED8", textDecoration: "underline", fontSize: 15, fontWeight: 600, textAlign: "left"
};

const miniTag = {
  borderRadius: 6, padding: "2px 6px", fontSize: 11,
  background: "#F3F4F6", color: "#374151", border: `1px solid ${TOKENS.border}`
};
const miniMuted = { fontSize: 12, color: TOKENS.textMuted };

const headCell = {
  textAlign: "left",
  fontWeight: 700,
  fontSize: 12,
  color: "#344054",
  padding: "10px 12px",
  borderBottom: `1px solid ${TOKENS.border}`,
};
const cell = {
  padding: "10px 12px",
  color: TOKENS.text,
  fontSize: 13,
};


