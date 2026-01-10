import { useEffect, useMemo, useState } from "react";
import BillLabel from "./components/BillLabel";
import { InlineSpinner } from "./components";
import { useDebouncedValue } from "./hooks/useDebouncedValue";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/* ================= helpers ================= */
function classifyResult(result) {
  const s = (result || "").toLowerCase();
  if (s.includes("pass") || s.includes("agreed")) return "passed";
  if (s.includes("fail") || s.includes("reject")) return "failed";
  return "other";
}

function ResultBadge({ result }) {
  const cls = classifyResult(result);
  const colors = {
    passed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    other: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${colors[cls]}`}>
      {result || "—"}
    </span>
  );
}

function PositionChip({ pos }) {
  const colors = {
    Yea: "bg-green-100 text-green-700",
    Nay: "bg-red-100 text-red-700",
    Present: "bg-gray-100 text-gray-600",
    "Not Voting": "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${colors[pos] || "bg-amber-100 text-amber-700"}`}>
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

function CountChip({ label, value, colorClass }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono tabular-nums ${colorClass}`}>
      <span className="opacity-80">{label}</span>
      <span>{value ?? 0}</span>
    </span>
  );
}

function Counts({ c }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <CountChip label="Y" value={c.yea} colorClass="bg-green-100 text-green-700" />
      <CountChip label="N" value={c.nay} colorClass="bg-red-100 text-red-700" />
      <CountChip label="P" value={c.present} colorClass="bg-gray-100 text-gray-600" />
      <CountChip label="NV" value={c.notVoting} colorClass="bg-amber-100 text-amber-700" />
    </div>
  );
}

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
  if (loading && !data) return <div className="p-3 text-gray-500">Loading member…</div>;
  if (err) return <div className="p-3 text-red-600">Error: {err}</div>;
  if (!data) return <div className="p-3">No data.</div>;

  const { profile, stats } = data;

  const setQuickPos = (p) => setFPos((cur) => (cur === p ? "all" : p));

  return (
    <div className="bg-gray-50 p-2 rounded-lg">
      {/* Card header */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 mb-2.5">
        <header className="flex gap-3 items-center mb-2">
          {profile?.imageUrl && (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              width={56}
              height={56}
              className="rounded-lg"
            />
          )}
          <div>
            <h2 className="m-0 text-xl font-bold">{profile?.name}</h2>
            <div className="text-gray-500">
              {profile?.party} • {profile?.state} • {profile?.bioguideId}
            </div>

            {/* Quick chips */}
            <div className="mt-2 flex gap-2 flex-wrap text-sm">
              <Chip colorClass="bg-green-100" onClick={() => setQuickPos("Yea")}>Yea {stats?.yea ?? 0}</Chip>
              <Chip colorClass="bg-red-100" onClick={() => setQuickPos("Nay")}>Nay {stats?.nay ?? 0}</Chip>
              <Chip colorClass="bg-gray-100" onClick={() => setQuickPos("Present")}>Present {stats?.present ?? 0}</Chip>
              <Chip colorClass="bg-amber-100" onClick={() => setQuickPos("Not Voting")}>Not Voting {stats?.notVoting ?? 0}</Chip>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by bill title or question…"
              className="w-full px-3 py-2.5 pr-9 rounded-lg border border-gray-300 bg-white text-sm"
            />
            {loading && (
              <InlineSpinner className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
          <select
            value={fPos}
            onChange={(e) => setFPos(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[130px]"
          >
            <option value="all">All positions</option>
            <option value="Yea">Yea</option>
            <option value="Nay">Nay</option>
            <option value="Present">Present</option>
            <option value="Not Voting">Not Voting</option>
          </select>
          <select
            value={fRes}
            onChange={(e) => setFRes(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[130px]"
          >
            <option value="all">Any result</option>
            <option value="passed">Passed/Agreed</option>
            <option value="failed">Failed/Rejected</option>
            <option value="other">Other</option>
          </select>
          <select
            value={fType}
            onChange={(e) => setFType(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[120px]"
          >
            <option value="all">All types</option>
            {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
          />
          {(q || fPos !== "all" || fRes !== "all" || fType !== "all" || from || to) && (
            <button
              onClick={() => { setQ(""); setFPos("all"); setFRes("all"); setFType("all"); setFrom(""); setTo(""); }}
              className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Showing <strong>{filtered.length}</strong> votes across <strong>{groups.length}</strong> bills
          {q && <> • search: "{q}"</>}
          {fPos !== "all" && <> • position: {fPos}</>}
          {fRes !== "all" && <> • result: {fRes}</>}
          {fType !== "all" && <> • type: {fType}</>}
          {(from || to) && <> • date: {from || "…"}–{to || "…"}</>}
        </div>
      </div>

      {/* GROUPS (collapsible) */}
      <div className="grid gap-2.5">
        {groups.map((g) => {
          const latestCounts = getCounts(g.latest || {});
          const isOpen = open.has(g.key);
          // for member context, show *member's* latest position in this bill's rolls
          const latestMemberPos = g.latest?.position || null;

          return (
            <div
              key={g.key}
              className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
            >
              {/* Group header - responsive: stack on mobile */}
              <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 border-b border-gray-100">
                {/* Row 1 on mobile: expand button + title */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => {
                      console.log('DEBUG navigation:', { billCongress: g.billCongress, billType: g.billType, billNumber: g.billNumber });
                      const n = new Set(open);
                      if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                      setOpen(n);
                    }}
                    title={isOpen ? "Hide roll calls" : "Show roll calls"}
                    className={`h-8 w-8 rounded-lg border-2 cursor-pointer font-bold text-lg transition-colors flex-shrink-0 ${
                      isOpen
                        ? "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100"
                        : "border-gray-400 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>

                  <div className="min-w-0 flex-1">
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
                        className="border-0 bg-transparent p-0 cursor-pointer text-blue-700 underline text-[15px] font-semibold text-left"
                      >
                        {g.title || `${g.billType} ${g.billNumber}`}
                      </button>
                    ) : (
                      <span className="text-gray-900">{g.title || "(Untitled bill)"}</span>
                    )}
                    <div className="flex gap-2 mt-1.5 items-center flex-wrap">
                      {g.billType && g.billNumber && (
                        <span className="rounded-md px-1.5 py-0.5 text-[11px] bg-gray-100 text-gray-700 border border-gray-200">
                          <BillLabel
                            legislationType={g.billType}
                            legislationNumber={g.billNumber}
                            subjectBillType={g.latest?.subjectBillType}
                            subjectBillNumber={g.latest?.subjectBillNumber}
                          />
                        </span>
                      )}
                      {g.latest?.started && (
                        <span className="text-xs text-gray-500">{String(g.latest.started).slice(0, 10)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 2 on mobile: result + counts */}
                <div className="flex gap-2.5 items-center flex-wrap md:flex-nowrap">
                  <ResultBadge result={g.latest?.result} />
                  <Counts c={latestCounts} />
                </div>

                {/* Row 3 on mobile: outcome sparks + position */}
                <div className="flex items-center justify-between gap-4 md:gap-2">
                  {/* tiny outcome spark (per chamber outcome) */}
                  <div className="flex gap-1 flex-wrap items-center">
                    {g.votes.slice(0, 8).map((v) => (
                      <span
                        key={v.roll}
                        title={`#${v.roll} • ${v.question || ""}`}
                        className={`w-2 h-2 rounded-sm inline-block ${
                          classifyResult(v.result) === "passed" ? "bg-green-300" :
                          classifyResult(v.result) === "failed" ? "bg-red-300" : "bg-gray-300"
                        }`}
                      />
                    ))}
                    {g.votes.length > 8 && (
                      <span className="text-gray-500 text-xs">+{g.votes.length - 8}</span>
                    )}
                  </div>

                  <PositionChip pos={latestMemberPos} />
                </div>
              </div>

              {/* Expanded inner table (member's roll calls for this bill) */}
              {isOpen && (
                <div className="p-2.5 bg-slate-50">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-slate-50 z-[1]">
                        <tr>
                          {["Roll", "Question", "Chamber Result", "Member Vote", "Date", ""].map((h, i) => (
                            <th
                              key={i}
                              className={`text-left font-bold text-xs text-gray-700 px-3 py-2.5 border-b border-gray-200 ${i === 5 ? "text-right" : ""}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.votes.map((v, idx) => (
                          <tr key={v.roll} className={`border-t border-gray-100 ${idx % 2 === 1 ? "bg-slate-100/50" : ""}`}>
                            <td className="px-3 py-2.5 text-gray-900 text-sm">#{v.roll}</td>
                            <td className="px-3 py-2.5 text-gray-900 text-sm min-w-[280px]">{v.question || "—"}</td>
                            <td className="px-3 py-2.5 text-sm"><ResultBadge result={v.result} /></td>
                            <td className="px-3 py-2.5 text-sm"><PositionChip pos={v.position} /></td>
                            <td className="px-3 py-2.5 text-gray-900 text-sm whitespace-nowrap">{String(v.started || "").slice(0, 10)}</td>
                            <td className="px-3 py-2.5 text-sm text-right">
                              {onOpenRoll ? (
                                <button
                                  onClick={() => onOpenRoll({ congress, session: v.session ?? session, roll: v.roll })}
                                  className="border border-gray-200 bg-white text-gray-900 rounded-lg px-2.5 py-1.5 cursor-pointer font-semibold hover:bg-gray-50"
                                >
                                  Open roll
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
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
function Chip({ children, colorClass = "bg-blue-50", onClick, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`border border-gray-200 rounded-full px-2.5 py-1 font-bold text-xs ${colorClass} ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
    >
      {children}
    </button>
  );
}
