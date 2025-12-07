import { useEffect, useMemo, useState } from "react";
import { ResultBadge, VoteButton } from "./components";
import BillLabel from "./components/BillLabel";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';




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

function CountChip({ label, value }) {
  const getColorClass = () => {
    switch (label) {
      case "Y": return "bg-vote-yea-bg text-vote-yea-fg";
      case "N": return "bg-vote-nay-bg text-vote-nay-fg";
      case "P": return "bg-vote-present-bg text-vote-present-fg";
      case "NV": return "bg-vote-not-voting-bg text-vote-not-voting-fg";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${getColorClass()} rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums font-mono`}>
      <span className="opacity-80">{label}</span>
      <span>{value ?? 0}</span>
    </span>
  );
}

function Counts({ c }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <CountChip label="Y" value={c.yea} />
      <CountChip label="N" value={c.nay} />
      <CountChip label="P" value={c.present} />
      <CountChip label="NV" value={c.notVoting} />
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);
    fetch(
      `${API_URL}/house/votes?congress=${congress}&session=${session}&window=200`,
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

  const allGroups = useMemo(() => {
    const map = new Map();
    for (const v of filtered) {
      let type = (v.legislationType || "").trim();
      let num = String(v.legislationNumber || "").trim();
      const title = (v.title || "").trim();
      
      // If this is a procedural vote (HRES) with a subject bill, group by the subject bill instead
      const isProceduralRule = type.toUpperCase() === 'HRES';
      const hasSubject = v.subjectBillType && v.subjectBillNumber;
      
      if (isProceduralRule && hasSubject) {
        // Group procedural votes under their subject bill
        type = v.subjectBillType;
        num = v.subjectBillNumber;
      }
      
      // Group by title first (more reliable), fall back to type::num
      const key = title ? `title::${title}` : (type && num ? `${type}::${num}` : `unknown`);
      
      if (!map.has(key)) {
        // Use title if available, otherwise use "TYPE NUMBER" format
        const displayTitle = title || (type && num ? `${type.toUpperCase()} ${num}` : "");
        map.set(key, { key, billType: type || null, billNumber: num || null, title: displayTitle, votes: [] });
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

  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return allGroups.slice(startIndex, endIndex);
  }, [allGroups, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(allGroups.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [q, fRes, fType, from, to]);

  if (loading) return <div className="p-3 text-gray-500">Loading voted bills…</div>;
  if (err) return <div className="p-3 text-red-600">Error: {err}</div>;


  return (
    <div className="bg-gray-50 p-2 rounded-lg">
      {/* Controls */}
      <div className="grid grid-cols-[minmax(260px,1fr)_180px_160px_150px_150px_120px] gap-2 items-center mb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title, question, type, or number…"
          className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white"
        />
        <select value={fRes} onChange={(e) => setFRes(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white">
          <option value="all">Any result</option>
          <option value="passed">Passed/Agreed</option>
          <option value="failed">Failed/Rejected</option>
          <option value="other">Other</option>
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white">
          <option value="all">All bill types</option>
          {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white" />
        <div className="flex gap-1.5 justify-end">
          <DensityToggle value={density} onChange={setDensity} />
          {(q || fRes !== "all" || fType !== "all" || from || to) && (
            <button
              onClick={() => { setQ(""); setFRes("all"); setFType("all"); setFrom(""); setTo(""); }}
              className="border border-gray-300 bg-white text-gray-900 rounded-lg px-2 py-2 cursor-pointer"
              title="Clear all filters"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex justify-between items-center mx-0.5 my-1.5 mb-2.5 text-xs text-gray-500">
        <span>
          Showing <strong>{allGroups.reduce((acc, g) => acc + g.votes.length, 0)}</strong> votes across{" "}
          <strong>{allGroups.length}</strong> bills
          {allGroups.length > itemsPerPage && (
            <> • Page {currentPage} of {totalPages}</>
          )}
        </span>
        <div className="flex items-center gap-2">
          <label className="text-xs">Per page:</label>
          <select 
            value={itemsPerPage} 
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Groups */}
      <div className="grid gap-2.5">
        {paginatedGroups.map((g) => {
          const latestCounts = getCounts(g.latest || {});
          const isOpen = open.has(g.key);
          return (
            <div
              key={g.key}
              className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden"
            >
              {/* Header row */}
              <div
                className={`grid grid-cols-[28px_minmax(260px,1fr)_340px_1fr_150px] items-center gap-3 px-3 border-b border-gray-100 ${density === "compact" ? "py-2" : "py-3"}`}
              >
                <button
                  onClick={() => {
                    const n = new Set(open);
                    if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                    setOpen(n);
                  }}
                  title={isOpen ? "Hide roll calls" : "Show roll calls"}
                  className={`h-8 w-8 rounded-lg border-2 cursor-pointer font-bold text-lg transition-colors ${
                    isOpen 
                      ? "border-blue-500 bg-blue-50 text-blue-600 hover:bg-blue-100" 
                      : "border-gray-400 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-500"
                  }`}
                >
                  {isOpen ? "▾" : "▸"}
                </button>

                <div className="min-w-0">
                  {g.billType && g.billNumber ? (
                    <button
                      onClick={() => onSelectBill?.({
                        congress,
                        billType: g.billType.toLowerCase(),
                        billNumber: g.billNumber,
                        title: g.title,
                        legislationType: g.billType,
                        legislationNumber: g.billNumber
                      })}
                      className="border-0 bg-transparent p-0 cursor-pointer text-blue-600 underline text-sm font-semibold text-left"
                    >
                      {g.title || `${g.billType} ${g.billNumber}`}
                    </button>
                  ) : (
                    <span className="text-gray-900">{g.title || "(Untitled bill)"}</span>
                  )}
                  <div className="flex gap-2 mt-1.5 items-center flex-wrap">
                    {g.billType && g.billNumber && (
                      <span className="rounded-md px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 border border-gray-300">
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

                <div className="flex gap-2.5 items-center flex-wrap">
                  <ResultBadge result={g.latest?.result} />
                  <Counts c={latestCounts} />
                </div>

                {/* tiny outcome spark */}
                <div className="flex gap-1 flex-wrap items-center">
                  {g.votes.slice(0, 8).map((v) => (
                    <span
                      key={v.roll}
                      title={`#${v.roll} • ${v.question || ""}`}
                      className={`w-2 h-2 rounded-sm inline-block ${classifyResult(v.result) === "passed" ? "bg-green-300" :
                        classifyResult(v.result) === "failed" ? "bg-red-300" : "bg-gray-300"
                        }`}
                    />
                  ))}
                  {g.votes.length > 8 && (
                    <span className="text-gray-500 text-xs">+{g.votes.length - 8}</span>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const v = g.latest; if (!v) return;
                      console.log("Opening latest roll for bill:", { g, v });
                      onSelectVote?.({
                        congress, session, roll: v.roll,
                        title: v.title,
                        legislationType: v.legislationType,
                        legislationNumber: v.legislationNumber
                      });
                    }}
                    className="border border-blue-600 bg-blue-600 text-white rounded-lg px-2 py-2 cursor-pointer font-bold"
                  >
                    Open latest roll
                  </button>
                </div>
              </div>

              {/* Expanded table */}
              {isOpen && (
                <div className="p-2.5 bg-slate-50">
                  <div className="overflow-x-auto">
                    <table cellPadding={0} className="w-full border-separate border-spacing-0">
                      <thead className="sticky top-0 bg-slate-50 z-10">
                        <tr>
                          {["Roll", "Question", "Result", "Counts", "Date", ""].map((h, i) => (
                            <th key={i} align={i === 5 ? "right" : "left"} className="text-left font-bold text-xs text-gray-700 px-3 py-2.5 border-b border-gray-300">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.votes.map((v, idx) => {
                          const c = getCounts(v);
                          const isProceduralVote = v.legislationType?.toUpperCase() === 'HRES' && v.subjectBillType;
                          return (
                            <tr key={v.roll} className={`border-t border-gray-100 ${idx % 2 === 1 ? "bg-blue-50" : ""}`}>
                              <td className="px-3 py-2.5 text-gray-900 text-sm">
                                #{v.roll}
                                {isProceduralVote && (
                                  <span className="ml-1 text-xs text-gray-500" title="Procedural vote">⚙️</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-900 text-sm min-w-[280px]">{v.question || "—"}</td>
                              <td className="px-3 py-2.5 text-gray-900 text-sm"><ResultBadge result={v.result} /></td>
                              <td className="px-3 py-2.5 text-gray-900 text-sm"><Counts c={c} /></td>
                              <td className="px-3 py-2.5 text-gray-900 text-sm">{String(v.started || "").slice(0, 10)}</td>
                              <td className="px-3 py-2.5 text-gray-900 text-sm text-right">
                                <button
                                  onClick={() => onSelectVote?.({ congress, session, roll: v.roll, title: v.title })}
                                  className="border border-gray-300 bg-white text-gray-900 rounded-lg px-1.5 py-1.5 cursor-pointer"
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-4 p-4">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${
              currentPage === 1 
                ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            ← Previous
          </button>
          
          <div className="flex items-center gap-2">
            {/* Show page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    currentPage === pageNum
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${
              currentPage === totalPages 
                ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}


function DensityToggle({ value, onChange }) {
  return (
    <div className="inline-flex border border-gray-300 rounded-full overflow-hidden">
      {["compact", "comfortable"].map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2.5 py-1.5 text-xs border-none cursor-pointer ${active ? "bg-blue-50 text-blue-600" : "bg-white text-gray-900"
              }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}





