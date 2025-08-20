import { useEffect, useState } from "react";
import BillSelector from "./BillSelector";
import VotesTable from "./VotesTable";

export default function App() {
  const [selectedVote, setSelectedVote] = useState(null); // { congress, session, roll, ... }
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [counts, setCounts] = useState(null);
  const [bill, setBill] = useState(null);
  const [error, setError] = useState(null);
  const [loadingVotes, setLoadingVotes] = useState(false);

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
    <div style={{ padding: 16, maxWidth: 1000 }}>
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

          {bill && (
            <div
              style={{
                padding: 12,
                border: "1px solid #eee",
                borderRadius: 8,
                background: "#fafafa",
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
                {bill.title || `${bill.billType?.toUpperCase()} ${bill.billNumber}`}
              </div>
              {bill.latestAction?.text && (
                <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>
                  Latest action: {bill.latestAction.actionDate} — {bill.latestAction.text}
                </div>
              )}
              {bill.latestSummary?.text && (
                <details style={{ fontSize: 13 }}>
                  <summary>Bill summary</summary>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                    {bill.latestSummary.text}
                  </div>
                </details>
              )}
              {bill.textVersions?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Text versions:&nbsp;
                  {bill.textVersions
                    .filter((v) => v.url)
                    .map((v, i) => (
                      <span key={i} style={{ marginRight: 8 }}>
                        <a href={v.url} target="_blank" rel="noreferrer">
                          {v.type}
                        </a>
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {counts && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#444" }}>
              Yea: {counts.yea} · Nay: {counts.nay} · Present: {counts.present} · Not Voting: {counts.notVoting}
            </div>
          )}

          <VotesTable rows={rows} />
        </div>
      )}
    </div>
  );
}
