import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function BillSelector({ onSelect }) {
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [value, setValue] = useState("");

  // Adjust congress/session to taste
  const CONGRESS = 119;
  const SESSION = 1;

  useEffect(() => {
    fetch(
      `${API_URL}/house/votes?congress=${CONGRESS}&session=${SESSION}&limit=50&include_titles=1&include_questions=1`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => setVotes(data || []))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading votes…</p>;
  if (err) return <p style={{ color: "red" }}>Error: {err}</p>;

  return (
    <select
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (!e.target.value) return;
        onSelect(JSON.parse(e.target.value));
      }}
      style={{ minWidth: "100%", maxWidth: "100%" }}
    >
      <option value="">Select a House roll-call</option>
      {votes.map((v, i) => {
        const question = (v.question && v.question.trim()) || "(No question)";
        const billId = `${v.legislationType} ${v.legislationNumber}`;
        const title = (v.title && v.title.trim()) || billId;
        const label = `Roll ${v.roll} — ${question} — ${billId} — ${title} (${v.result ?? "—"})`;

        const payload = {
          congress: v.congress,
          session: v.session,
          roll: v.roll,
          question: v.question || null, // pass through for header fallback
          title: v.title || null,       // pass through for header fallback
          result: v.result,
          legislationType: v.legislationType,
          legislationNumber: v.legislationNumber,
          source: v.source,
        };

        return (
          <option
            key={`${v.congress}-${v.session}-${v.roll}-${i}`}
            value={JSON.stringify(payload)}
            title={label}
          >
            {label}
          </option>
        );
      })}
    </select>
  );
}
