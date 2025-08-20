import { useEffect, useState } from "react";

export default function BillSelector({ onSelect }) {
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [value, setValue] = useState("");

  // Adjust congress/session to taste
  const CONGRESS = 119;
  const SESSION = 1;

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/house/votes?congress=${CONGRESS}&session=${SESSION}&limit=50`)
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
      style={{ minWidth: 680 }}
    >
      <option value="">Select a House roll-call</option>
      {votes.map((v, i) => {
        const label = `Roll ${v.roll} — ${v.legislationType} ${v.legislationNumber} — ${v.question} (${v.result ?? "—"})`;
        const payload = {
          congress: v.congress,
          session: v.session,
          roll: v.roll,
          question: v.question,
          result: v.result,
          legislationType: v.legislationType,
          legislationNumber: v.legislationNumber,
          source: v.source,
        };
        return (
          <option key={`${v.congress}-${v.session}-${v.roll}-${i}`} value={JSON.stringify(payload)} title={label}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
