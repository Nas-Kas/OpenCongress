import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function VotePicker({ onSelect }) {
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const CONGRESS = 119;
  const SESSION = 1;

  useEffect(() => {
    fetch(
      `${API_URL}/house/votes?congress=${CONGRESS}&session=${SESSION}&limit=200&include_titles=1&include_questions=1`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => setVotes(data?.votes || data || []))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Close on click outside
  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return votes.slice(0, 50);
    const q = query.toLowerCase();
    return votes.filter((v) => {
      const billId = `${v.legislationType} ${v.legislationNumber}`.toLowerCase();
      const title = (v.title || "").toLowerCase();
      const question = (v.question || "").toLowerCase();
      return billId.includes(q) || title.includes(q) || question.includes(q);
    }).slice(0, 80);
  }, [votes, query]);

  const choose = (v) => {
    const payload = {
      congress: v.congress,
      session: v.session,
      roll: v.roll,
      question: v.question || null,
      title: v.title || null,
      result: v.result,
      legislationType: v.legislationType,
      legislationNumber: v.legislationNumber,
      source: v.source,
    };
    setQuery(
      v.title
        ? `${v.title} — ${v.legislationType} ${v.legislationNumber}`
        : `${v.legislationType} ${v.legislationNumber}`
    );
    setOpen(false);
    onSelect?.(payload);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search roll calls by bill/question…"
        className="w-full px-2.5 py-2 rounded-lg border border-gray-300"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-300 rounded-lg mt-1.5 max-h-80 overflow-auto shadow-lg"
        >
          {loading && <div className="p-2.5 text-xs">Loading…</div>}
          {err && <div className="p-2.5 text-xs text-red-600">Error: {err}</div>}
          {!loading && !err && filtered.length === 0 && (
            <div className="p-2.5 text-xs text-gray-600">No matches</div>
          )}
          {!loading && !err && filtered.map((v) => {
            const billId = `${v.legislationType} ${v.legislationNumber}`;
            const title = v.title || billId;
            const question = v.question || "(No question)";
            return (
              <button
                key={`${v.congress}-${v.session}-${v.roll}`}
                onClick={() => choose(v)}
                className="block w-full text-left p-2.5 bg-white border-0 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                title={`Roll ${v.roll} — ${question} — ${billId} (${v.result ?? "—"})`}
              >
                <div className="text-sm font-semibold mb-0.5">
                  Roll {v.roll} — {title}
                </div>
                <div className="text-xs text-gray-600">
                  {question} • {billId} • {v.result ?? "—"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
