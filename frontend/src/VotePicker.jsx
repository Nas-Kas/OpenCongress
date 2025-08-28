import { useEffect, useMemo, useRef, useState } from "react";

export default function VotePicker({ onSelect }) {
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Adjust congress/session to taste
  const CONGRESS = 119;
  const SESSION = 1;

  useEffect(() => {
    fetch(
      `http://127.0.0.1:8000/house/votes?congress=${CONGRESS}&session=${SESSION}&limit=200&include_titles=1&include_questions=1`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => setVotes(data || []))
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
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search roll calls by bill/question…"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            marginTop: 6,
            maxHeight: 320,
            overflow: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,.08)",
          }}
        >
          {loading && <div style={{ padding: 10, fontSize: 13 }}>Loading…</div>}
          {err && <div style={{ padding: 10, fontSize: 13, color: "red" }}>Error: {err}</div>}
          {!loading && !err && filtered.length === 0 && (
            <div style={{ padding: 10, fontSize: 13, color: "#666" }}>No matches</div>
          )}
          {!loading && !err && filtered.map((v) => {
            const billId = `${v.legislationType} ${v.legislationNumber}`;
            const title = v.title || billId;
            const question = v.question || "(No question)";
            return (
              <button
                key={`${v.congress}-${v.session}-${v.roll}`}
                onClick={() => choose(v)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "white",
                  border: 0,
                  borderBottom: "1px solid #f3f4f6",
                  cursor: "pointer",
                }}
                title={`Roll ${v.roll} — ${question} — ${billId} (${v.result ?? "—"})`}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                  Roll {v.roll} — {title}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>
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
