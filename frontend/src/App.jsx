import { useEffect, useMemo, useState } from "react";
import VotePicker from "./VotePicker";
import VotesTable from "./VotesTable";
import VotedBillsTable from "./VotedBillsTable";
import MemberPage from "./MemberPage";
import MemberSearch from "./MemberSearch";
import BillPage from "./BillPage";
import BettingPage from "./BettingPage";
import Learn from "./Learn";
import BillsWithoutVotes from "./BillsWithoutVotes";

// tiny helpers for URL sync
const getQS = () => new URLSearchParams(window.location.search);
const setQS = (obj) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const url = `${window.location.pathname}?${qs.toString()}`;
  window.history.replaceState(null, "", url);
};

export default function App() {
  // Main view state (roll details)
  const [selectedVote, setSelectedVote] = useState(null); // { congress, session, roll, ... }
  const [rows, setRows] = useState([]);                   // flattened ballots
  const [meta, setMeta] = useState(null);                 // vote metadata
  const [counts, setCounts] = useState(null);             // totals
  const [bill, setBill] = useState(null);                 // minimal bill info
  const [error, setError] = useState(null);
  const [loadingVotes, setLoadingVotes] = useState(false);

  // Member view state
  const [selectedMember, setSelectedMember] = useState(null); // bioguideId or null

  // Bill view state
  const [selectedBill, setSelectedBill] = useState(null);     // { congress, billType, billNumber }

  // Betting view state
  const [showBetting, setShowBetting] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [showBillsWithoutVotes, setShowBillsWithoutVotes] = useState(false);
  
  // View mode for voted bills
  const [showVotedBillsList, setShowVotedBillsList] = useState(true); // true = table view, false = individual vote view

  // Tab state derived from selection
  const activeTab = useMemo(() => {
    if (showBetting) return "betting";
    if (showLearn) return "learn";
    if (showBillsWithoutVotes) return "bills";
    if (selectedMember) return "member";
    return "rolls";
  }, [selectedMember, showBetting, showLearn, showBillsWithoutVotes]);

  // Initial URL hydration
  useEffect(() => {
    const qs = getQS();
    const member = qs.get("member");
    const congress = qs.get("congress");
    const session = qs.get("session");
    const roll = qs.get("roll");
    const billType = qs.get("billType");
    const billNumber = qs.get("billNumber");
    const betting = qs.get("betting");

    if (betting === "true") {
      setShowBetting(true);
      return;
    }

    const learn = qs.get("learn");
    if (learn === "true") {
      setShowLearn(true);
      return;
    }

    const bills = qs.get("bills");
    if (bills === "true") {
      setShowBillsWithoutVotes(true);
      return;
    }
    if (member) {
      setSelectedMember(member.toUpperCase());
      return;
    }
    if (billType && billNumber) {
      setSelectedBill({
        congress: Number(congress || 119),
        billType: billType.toLowerCase(),
        billNumber: billNumber,
      });
      return;
    }
    if (congress && session && roll) {
      setSelectedVote({
        congress: Number(congress),
        session: Number(session),
        roll: Number(roll),
      });
    }
  }, []);

  // Sync URL when switching to a member
  useEffect(() => {
    if (selectedMember) {
      setQS({ member: selectedMember });
    }
  }, [selectedMember]);

  // Sync URL when switching to a bill
  useEffect(() => {
    if (selectedBill) {
      setQS({
        congress: selectedBill.congress,
        billType: selectedBill.billType,
        billNumber: selectedBill.billNumber,
      });
    }
  }, [selectedBill]);

  // Sync URL when switching to betting
  useEffect(() => {
    if (showBetting) {
      setQS({ betting: "true" });
    }
  }, [showBetting]);

  // Sync URL when switching to learn
  useEffect(() => {
    if (showLearn) {
      setQS({ learn: "true" });
    }
  }, [showLearn]);

  // Sync URL when switching to bills
  useEffect(() => {
    if (showBillsWithoutVotes) {
      setQS({ bills: "true" });
    }
  }, [showBillsWithoutVotes]);

  // When a vote is selected, fetch its details
  useEffect(() => {
    if (!selectedVote) return;
    const { congress, session, roll } = selectedVote;

    // sync URL for deep links
    setQS({ congress, session, roll });

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

  // --- Betting view branch ---
  if (showBetting) {
    return (
      <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
        <NavTabs
          active="betting"
          onChange={(tab) => {
            if (tab === "rolls") {
              setShowBetting(false);
              setQS({});
            } else if (tab === "member") {
              setShowBetting(false);
              setSelectedMember("C001130");
            } else if (tab === "learn") {
              setShowBetting(false);
              setShowLearn(true);
            } else if (tab === "bills") {
              setShowBetting(false);
              setShowBillsWithoutVotes(true);
            }
          }}
        />
        <BettingPage />
      </div>
    );
  }

  // --- Learn view branch ---
  if (showLearn) {
    return (
      <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
        <NavTabs
          active="learn"
          onChange={(tab) => {
            if (tab === "rolls") {
              setShowLearn(false);
              setQS({});
            } else if (tab === "member") {
              setShowLearn(false);
              setSelectedMember("C001130");
            } else if (tab === "betting") {
              setShowLearn(false);
              setShowBetting(true);
            } else if (tab === "bills") {
              setShowLearn(false);
              setShowBillsWithoutVotes(true);
            }
          }}
        />
        <Learn />
      </div>
    );
  }

  // --- Bills Without Votes view branch ---
  if (showBillsWithoutVotes) {
    return (
      <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
        <NavTabs
          active="bills"
          onChange={(tab) => {
            if (tab === "rolls") {
              setShowBillsWithoutVotes(false);
              setQS({});
            } else if (tab === "member") {
              setShowBillsWithoutVotes(false);
              setSelectedMember("C001130");
            } else if (tab === "betting") {
              setShowBillsWithoutVotes(false);
              setShowBetting(true);
            } else if (tab === "learn") {
              setShowBillsWithoutVotes(false);
              setShowLearn(true);
            }
          }}
        />
        <BillsWithoutVotes />
      </div>
    );
  }

  // --- Bill view branch ---
  if (selectedBill) {
    return (
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <BillPage
          congress={selectedBill.congress}
          billType={selectedBill.billType}
          billNumber={selectedBill.billNumber}
          onBack={() => setSelectedBill(null)}
          onOpenRoll={(v) => {
            setSelectedBill(null);
            setSelectedVote(v);
            setSelectedMember(null);
          }}
        />
      </div>
    );
  }

  // --- Member view branch ---
  if (selectedMember) {
    return (
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <NavTabs
          active="member"
          onChange={(tab) => {
            if (tab === "rolls") {
              setSelectedMember(null);
              // If there was no prior roll, clean URL
              const qs = getQS();
              const c = qs.get("congress"), s = qs.get("session"), r = qs.get("roll");
              if (!c || !s || !r) setQS({});
            } else if (tab === "betting") {
              setSelectedMember(null);
              setShowBetting(true);
            } else if (tab === "learn") {
              setSelectedMember(null);
              setShowLearn(true);
            } else if (tab === "bills") {
              setSelectedMember(null);
              setShowBillsWithoutVotes(true);
            }
          }}
        />
        <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
          <button type="button" onClick={() => setSelectedMember(null)}>← Back to Roll Calls</button>
          <MemberSearch onSelect={(id) => id && setSelectedMember(id.toUpperCase())} />
        </div>
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
      <NavTabs
        active={activeTab}
        onChange={(tab) => {
          if (tab === "member") {
            setSelectedMember("C001130"); // optional seed
            setQS({ member: "C001130" });
          } else if (tab === "betting") {
            setShowBetting(true);
            setSelectedMember(null);
            setSelectedBill(null);
          } else if (tab === "learn") {
            setShowLearn(true);
            setSelectedMember(null);
            setSelectedBill(null);
          } else if (tab === "bills") {
            setShowBillsWithoutVotes(true);
            setSelectedMember(null);
            setSelectedBill(null);
          }
        }}
      />

      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>🗳️ House Roll-Call Votes</h1>
        <p style={{ 
          margin: 0, 
          color: "#6b7280", 
          fontSize: 14,
          lineHeight: 1.4 
        }}>
          Bills that have been voted on by the House. For bills that haven't been voted on yet, check the "📋 Early Bills" tab.
        </p>
      </div>

      {/* View toggle and search */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => {
              setShowVotedBillsList(true);
              setSelectedVote(null);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: showVotedBillsList ? "#eef2ff" : "transparent",
              color: showVotedBillsList ? "#1d4ed8" : "#111",
              border: "1px solid #e5e7eb",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            📊 Vote Overview
          </button>
          <button
            onClick={() => {
              setShowVotedBillsList(false);
              if (!selectedVote) {
                // Set a default vote if none selected
                setSelectedVote({ congress: 119, session: 1, roll: 1 });
              }
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: !showVotedBillsList ? "#eef2ff" : "transparent",
              color: !showVotedBillsList ? "#1d4ed8" : "#111",
              border: "1px solid #e5e7eb",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            👥 Vote by Member
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <MemberSearch onSelect={(id) => id && setSelectedMember(id.toUpperCase())} />
        </div>
      </div>

      {showVotedBillsList ? (
        <VotedBillsTable
          congress={119}
          session={1}
          onSelectVote={(vote) => {
            setSelectedVote(vote);
            setShowVotedBillsList(false);
            setSelectedMember(null);
            setSelectedBill(null);
          }}
          onSelectBill={(bill) => {
            setSelectedBill(bill);
            setSelectedMember(null);
          }}
        />
      ) : (
        <>
          {/* Roll select */}
          <div style={{ marginBottom: 16 }}>
            <VotePicker
              onSelect={(payload) => {
                setSelectedVote(payload);
                setSelectedMember(null);
                setSelectedBill(null);
              }}
            />
          </div>

          {error && <p style={{ color: "red", marginTop: 12 }}>Error: {error}</p>}

      {!selectedVote ? (
        <p style={{ marginTop: 16, color: "#444" }}>Select a vote to see details.</p>
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
              {" • "}
              <button
                type="button"
                onClick={() =>
                  setSelectedBill({
                    congress: meta.congress,
                    billType: (meta.legislationType || "").toLowerCase(),
                    billNumber: String(meta.legislationNumber || ""),
                  })
                }
                title="Open this bill’s lifecycle"
              >
                Bill view
              </button>
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
        </>
      )}
    </div>
  );
}

function NavTabs({ active = "rolls", onChange }) {
  const tabStyle = (isActive) => ({
    padding: "8px 12px",
    borderRadius: 8,
    background: isActive ? "#eef2ff" : "transparent",
    color: isActive ? "#1d4ed8" : "#111",
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    fontWeight: 600,
  });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button style={tabStyle(active === "rolls")} onClick={() => onChange?.("rolls")}>🗳️ Voted Bills</button>
      <button style={tabStyle(active === "member")} onClick={() => onChange?.("member")}>👤 Member</button>
      <button style={tabStyle(active === "betting")} onClick={() => onChange?.("betting")}>💰 Betting</button>
      <button style={tabStyle(active === "bills")} onClick={() => onChange?.("bills")}>📋 Early Bills</button>
      <button style={tabStyle(active === "learn")} onClick={() => onChange?.("learn")}>🎓 Learn</button>
    </div>
  );
}
