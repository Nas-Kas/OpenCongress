import { useEffect, useMemo, useState } from "react";
import BillLabel from "./components/BillLabel";
import { InlineSpinner } from "./components";
import { useDebouncedValue } from "./hooks/useDebouncedValue";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/* ================= UI tokens ================= */
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

/* ================= helpers ================= */
function classifyResult(result) {
  const s = (result || "").toLowerCase();
  if (s.includes("pass") || s.includes("agreed")) return "passed";
  if (s.includes("fail") || s.includes("reject")) return "failed";
  return "other";
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

function PositionChip({ pos }) {
  const bg =
    pos === "Yea" ? TOKENS.badge.yBg :
    pos === "Nay" ? TOKENS.badge.nBg :
    pos === "Present" ? TOKENS.badge.pBg :
    TOKENS.badge.nvBg;
  const fg =
    pos === "Yea" ? TOKENS.badge.yFg :
    pos === "Nay" ? TOKENS.badge.nFg :
    pos === "Present" ? TOKENS.badge.pFg :
    TOKENS.badge.nvFg;

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
    }}>
      {pos || "—"}
    </span>
  );
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

/* ================= shared styles ================= */
const inputStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${TOKENS.border}`,
  background: "#fff",
};
const selectStyle = { ...inputStyle };
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
const titleLink = {
  border: 0, background: "transparent", padding: 0, cursor: "pointer",
  color: "#1D4ED8", textDecoration: "underline", fontSize: 15, fontWeight: 600, textAlign: "left"
};
const miniTag = {
  borderRadius: 6, padding: "2px 6px", fontSize: 11,
  background: "#F3F4F6", color: "#374151", border: `1px solid ${TOKENS.border}`
};
const miniMuted = { fontSize: 12, color: TOKENS.textMuted };
const chevBtn = (isOpen) => ({
  height: 32, width: 32, borderRadius: 8,
  border: isOpen ? "2px solid #3B82F6" : "2px solid #9CA3AF",
  background: isOpen ? "#EFF6FF" : "#fff",
  color: isOpen ? "#2563EB" : "#4B5563",
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 700,
  transition: "all 0.2s"
});
const rowBtn = {
  border: `1px solid ${TOKENS.btn.secondaryBorder}`,
  background: "#fff",
  color: TOKENS.text,
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 600,
};

/* ================= component ================= */
export default function MemberPage({ bioguideId, congress = 119, session = 1, onOpenRoll }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 400);
  const [fPos, setFPos] = useState("all");
  const [fRes, setFRes] = useState("all");
  const [fType, setFType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [open, setOpen] = useState(() => new Set()); // group expand/collapse

  // Fetch member votes with server-side search
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    // Don't clear data - keep showing old results while fetching

    // Build query parameters
    const params = new URLSearchParams({
      congress: congress.toString(),
      session: session.toString(),
      limit: '200',
      offset: '0'
    });

    // Add search parameter if provided (use debounced value)
    if (debouncedQ.trim()) {
      params.set('search', debouncedQ.trim());
    }

    fetch(
      `${API_URL}/member/${bioguideId}/house-votes?${params.toString()}`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [bioguideId, congress, session, debouncedQ]); // Use debounced value to prevent excessive API calls

  const votes = useMemo(() => data?.votes ?? [], [data]);

  const uniqueTypes = useMemo(() => {
    const s = new Set();
    for (const v of votes) if (v.legislationType) s.add(v.legislationType);
    return Array.from(s);
  }, [votes]);

  // Client-side filtering for non-search filters (position, result, type, dates)
  const filtered = useMemo(() => {
    let list = votes;
    
    // Note: Search is now handled server-side, so we don't filter by q here
    if (fPos !== "all") list = list.filter((v) => v.position === fPos);
    if (fRes !== "all") list = list.filter((v) => classifyResult(v.result) === fRes);
    if (fType !== "all") list = list.filter((v) => (v.legislationType || "") === fType);
    if (from) list = list.filter((v) => (v.started || "").slice(0, 10) >= from);
    if (to) list = list.filter((v) => (v.started || "").slice(0, 10) <= to);

    // Server already sorts by date DESC, so we maintain that order
    return list;
  }, [votes, fPos, fRes, fType, from, to]); // Removed q from dependencies

  // === GROUP BY BILL (same logic as VotedBillsTable) ===
  const groups = useMemo(() => {
    const map = new Map();
    for (const v of filtered) {
      console.log('Vote object keys:', Object.keys(v), 'congress:', v.congress);
      let type = (v.legislationType || "").trim();
      let num = String(v.legislationNumber || "").trim();
      
      // If this is a procedural vote (HRES) with a subject bill, group by the subject bill instead
      const isProceduralRule = type.toUpperCase() === 'HRES';
      const hasSubject = v.subjectBillType && v.subjectBillNumber;
      
      if (isProceduralRule && hasSubject) {
        // Group procedural votes under their subject bill
        type = v.subjectBillType;
        num = v.subjectBillNumber;
      }
      
      const key = type && num ? `${type}::${num}` : `title::${(v.title || "").trim()}`;
      if (!map.has(key)) {
        // Use title if available, otherwise use "TYPE NUMBER" format
        const displayTitle = (v.title || "").trim() || (type && num ? `${type.toUpperCase()} ${num}` : "");
        map.set(key, {
          key,
          billType: type || null,
          billNumber: num || null,
          billCongress: v.congress || congress,  // Use vote's congress, fallback to prop
          title: displayTitle,
          votes: [],
        });
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

  // Only show full loading screen if we have no data yet
  if (loading && !data) return <div style={{ padding: 12, color: TOKENS.textMuted }}>Loading member…</div>;
  if (err) return <div style={{ padding: 12, color: "#B42318" }}>Error: {err}</div>;
  if (!data) return <div style={{ padding: 12 }}>No data.</div>;

  const { profile, stats } = data;

  const setQuickPos = (p) => setFPos((cur) => (cur === p ? "all" : p));

  return (
    <div style={{ background: TOKENS.pageBg, padding: 8, borderRadius: TOKENS.radius }}>
      {/* Card header */}
      <div style={{
        background: TOKENS.cardBg,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: TOKENS.radius,
        boxShadow: TOKENS.shadow,
        padding: 12,
        marginBottom: 10
      }}>
        <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          {profile?.imageUrl && (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              width={56}
              height={56}
              style={{ borderRadius: 8 }}
            />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{profile?.name}</h2>
            <div style={{ color: TOKENS.textMuted }}>
              {profile?.party} • {profile?.state} • {profile?.bioguideId}
            </div>

            {/* Quick chips */}
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
              <Chip color={TOKENS.badge.yBg} onClick={() => setQuickPos("Yea")}>Yea {stats?.yea ?? 0}</Chip>
              <Chip color={TOKENS.badge.nBg} onClick={() => setQuickPos("Nay")}>Nay {stats?.nay ?? 0}</Chip>
              <Chip color={TOKENS.badge.pBg} onClick={() => setQuickPos("Present")}>Present {stats?.present ?? 0}</Chip>
              <Chip color={TOKENS.badge.nvBg} onClick={() => setQuickPos("Not Voting")}>Not Voting {stats?.notVoting ?? 0}</Chip>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 160px 160px 150px 150px 120px", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by bill title or question…"
              style={{ ...inputStyle, width: "100%", paddingRight: 36 }}
            />
            {loading && (
              <InlineSpinner className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
          <select value={fPos} onChange={(e) => setFPos(e.target.value)} style={selectStyle}>
            <option value="all">All positions</option>
            <option value="Yea">Yea</option>
            <option value="Nay">Nay</option>
            <option value="Present">Present</option>
            <option value="Not Voting">Not Voting</option>
          </select>
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
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: TOKENS.textMuted }}>
          Showing <strong>{filtered.length}</strong> votes across <strong>{groups.length}</strong> bills
          {q && <> • search: “{q}”</>}
          {fPos !== "all" && <> • position: {fPos}</>}
          {fRes !== "all" && <> • result: {fRes}</>}
          {fType !== "all" && <> • type: {fType}</>}
          {(from || to) && <> • date: {from || "…"}–{to || "…"}</>}
          {(q || fPos !== "all" || fRes !== "all" || fType !== "all" || from || to) && (
            <> • <button
              onClick={() => { setQ(""); setFPos("all"); setFRes("all"); setFType("all"); setFrom(""); setTo(""); }}
              style={{ border: 0, background: "transparent", color: "#1d4ed8", textDecoration: "underline", cursor: "pointer" }}
            >
              reset
            </button></>
          )}
        </div>
      </div>

      {/* GROUPS (collapsible) */}
      <div style={{ display: "grid", gap: 10 }}>
        {groups.map((g) => {
          const latestCounts = getCounts(g.latest || {});
          const isOpen = open.has(g.key);
          // for member context, show *member's* latest position in this bill's rolls
          const latestMemberPos = g.latest?.position || null;

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
              {/* Group header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px minmax(260px,1fr) 340px 1fr 180px",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderBottom: `1px solid ${TOKENS.borderSubtle}`,
                }}
              >
                <button
                  onClick={() => {
                        console.log('DEBUG navigation:', { billCongress: g.billCongress, billType: g.billType, billNumber: g.billNumber });
                    const n = new Set(open);
                    if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                    setOpen(n);
                  }}
                  title={isOpen ? "Hide roll calls" : "Show roll calls"}
                  style={chevBtn(isOpen)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isOpen ? "#DBEAFE" : "#F9FAFB";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isOpen ? "#EFF6FF" : "#fff";
                  }}
                >
                  {isOpen ? "▾" : "▸"}
                </button>

                <div style={{ minWidth: 0 }}>
                  {g.billType && g.billNumber ? (
                    <button
                      onClick={() => {
                        console.log('DEBUG navigation:', { billCongress: g.billCongress, billType: g.billType, billNumber: g.billNumber });
                        const url = new URL(window.location);
                        url.searchParams.set('congress', g.billCongress);
                        url.searchParams.set('billType', g.billType.toLowerCase());
                        url.searchParams.set('billNumber', g.billNumber);
                        url.searchParams.delete('member');
                        window.location.href = url.toString();
                      }}
                      style={titleLink}
                    >
                      {g.title || `${g.billType} ${g.billNumber}`}
                    </button>
                  ) : (
                    <span style={{ color: TOKENS.text }}>{g.title || "(Untitled bill)"}</span>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {g.billType && g.billNumber && (
                      <span style={miniTag}>
                        <BillLabel 
                          legislationType={g.billType}
                          legislationNumber={g.billNumber}
                          subjectBillType={g.latest?.subjectBillType}
                          subjectBillNumber={g.latest?.subjectBillNumber}
                        />
                      </span>
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

                {/* tiny outcome spark (per chamber outcome) */}
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
                  <PositionChip pos={latestMemberPos} />
                </div>
              </div>

              {/* Expanded inner table (member’s roll calls for this bill) */}
              {isOpen && (
                <div style={{ padding: 10, background: "#FBFCFE" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table cellPadding={0} style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead style={{ position: "sticky", top: 0, background: "#FBFCFE", zIndex: 1 }}>
                        <tr>
                          {["Roll", "Question", "Chamber Result", "Member Vote", "Date", ""].map((h, i) => (
                            <th key={i} align={i === 5 ? "right" : "left"} style={headCell}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.votes.map((v, idx) => {
                          const zebra = idx % 2 === 1 ? { background: "#F7F9FD" } : null;
                          return (
                            <tr key={v.roll} style={{ borderTop: `1px solid ${TOKENS.borderSubtle}`, ...zebra }}>
                              <td style={cell}>#{v.roll}</td>
                              <td style={{ ...cell, minWidth: 280 }}>{v.question || "—"}</td>
                              <td style={cell}><ResultBadge result={v.result} /></td>
                              <td style={cell}><PositionChip pos={v.position} /></td>
                              <td style={{ ...cell, whiteSpace: "nowrap" }}>{String(v.started || "").slice(0,10)}</td>
                              <td style={{ ...cell, textAlign: "right" }}>
                                {onOpenRoll ? (
                                  <button
                                    onClick={() => onOpenRoll({ congress, session: v.session ?? session, roll: v.roll })}
                                    style={rowBtn}
                                  >
                                    Open roll
                                  </button>
                                ) : null}
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

/* ================= small bits ================= */
function Chip({ children, color = "#eef2ff", onClick, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        border: `1px solid ${TOKENS.border}`,
        background: color,
        borderRadius: 999,
        padding: "4px 10px",
        cursor: onClick ? "pointer" : "default",
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}
