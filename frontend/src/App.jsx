import { useEffect, useState } from "react";
import BillSelector from "./BillSelector";
import VotesTable from "./VotesTable";
import MemberPage from "./MemberPage";

export default function App() {
  // Main view state
  const [selectedVote, setSelectedVote] = useState(null); // { congress, session, roll, ... }
  const [rows, setRows] = useState([]);                   // flattened ballots for the selected vote
  const [meta, setMeta] = useState(null);                 // vote metadata (question/result/links)
  const [counts, setCounts] = useState(null);             // Yea/Nay/Present/Not Voting totals
  const [bill, setBill] = useState(null);                 // minimal bill info (optional)
  const [error, setError] = useState(null);
  const [loadingVotes, setLoadingVotes] = useState(false);

  // Member detail view state
  const [selectedMember, setSelectedMember] = useState(null); // bioguideId or null

  // When a vote is selected, fetch its details
  useEffect(() => {
    if (!selectedVote) return;
    const { congress, session, roll } = selectedVote;

    setLoadingVotes(true);
    setError(null);

    fetch(`http://127.0.0.1:8000/house/vote-detail?congress=${congress}&session=${session}&roll=${roll}`)
      .then(async (r) => {
        if (r.status === 404) return { votes: [], meta: null, counts: null, bill: null };
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => {
        setRows(data.votes || []);
        setMeta(data.meta || null);
        setCounts(data.counts || null);
        setBill(data.bill || null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingVotes(false));
  }, [selectedVote]);

  // If user opened a member profile, render that page instead of the vote table
  if (selectedMember) {
    return (
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => setSelectedMember(null)}
          style={{ marginBottom: 12 }}
        >
          ← Back to vote
        </button>
        <MemberPage bioguideId={selectedMember} congress={119} session={1} />
      </div>
    );
  }

  const displayQuestion =
    (meta?.question && meta.question.trim()) ||
    (selectedVote?.question && selectedVote.question.trim()) ||
    "(No question)";

  const billId = meta ? `${meta.legislationType} ${meta.legislationNumber}` : "";
  const displayTitle =
    bill?.title ||
    (selectedVote?.title && selectedVote.title.trim()) ||
    billId;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1>House Roll-Call Votes</h1>

      <BillSelector onSelect={setSelectedVote} />

      {error && <p style={{ color: "red", marginTop: 12 }}>Error: {error}</p>}

      {!selectedVote ? (
        <p style={{ marginTop: 16 }}>Select a vote to see details.</p>
      ) : loadingVotes ? (
        <p style={{ marginTop: 16 }}>Loading vote details…</p>
      ) : rows.length === 0 ? (
        <p style={{ marginTop: 16 }}>No ballots found for this vote.</p>
      ) : (
        <div style={{ marginTop: 16 }}>
          {meta && (
            <div style={{ marginBottom: 8, fontSize: 14 }}>
              <span style={{ fontStyle: "italic" }}>{displayQuestion}</span>{" "}
              — <strong>{billId}</strong>{" "}
              — <span>{displayTitle}</span>
              {" • "}Result: <em>{meta.result}</em>{" "}
              {meta.source && (
                <>
                  •{" "}
                  <a href={meta.source} target="_blank" rel="noreferrer">
                    Clerk source
                  </a>
                </>
              )}
              {meta.legislationUrl && (
                <>
                  {" "}&bull;{" "}
                  <a href={meta.legislationUrl} target="_blank" rel="noreferrer">
                    Congress.gov page
                  </a>
                </>
              )}
            </div>
          )}

          {counts && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#444" }}>
              Yea: {counts.yea} · Nay: {counts.nay} · Present: {counts.present} · Not Voting: {counts.notVoting}
            </div>
          )}

          <VotesTable
            rows={rows}
            onOpenMember={(bioguideId) => bioguideId && setSelectedMember(bioguideId)}
          />
        </div>
      )}
    </div>
  );
}
