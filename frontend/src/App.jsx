import { useEffect, useState } from "react";
import VotesTable from "./VotesTable";
import VotedBillsTable from "./VotedBillsTable";
import MemberPage from "./MemberPage";
import MemberSearch from "./MemberSearch";
import BillPage from "./BillPage";
import BillsWithoutVotes from "./BillsWithoutVotes";
import { LoadingSpinner, ErrorMessage } from "./components";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

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
  const [selectedVote, setSelectedVote] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [counts, setCounts] = useState(null);
  const [bill, setBill] = useState(null);
  const [error, setError] = useState(null);
  const [loadingVotes, setLoadingVotes] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);
  const [activeTab, setActiveTab] = useState("bills"); // "bills" | "votes" | "members"

  useEffect(() => {
    const qs = getQS();
    const tab = qs.get("tab");
    const member = qs.get("member");
    const congress = qs.get("congress");
    const session = qs.get("session");
    const roll = qs.get("roll");
    const billType = qs.get("billType");
    const billNumber = qs.get("billNumber");

    if (tab) setActiveTab(tab);
    
    if (member) {
      setSelectedMember(member.toUpperCase());
      setActiveTab("members");
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
      setActiveTab("votes");
    }
  }, []);

  useEffect(() => {
    if (selectedMember) setQS({ tab: "members", member: selectedMember });
  }, [selectedMember]);

  useEffect(() => {
    if (selectedBill)
      setQS({
        congress: selectedBill.congress,
        billType: selectedBill.billType,
        billNumber: selectedBill.billNumber,
      });
  }, [selectedBill]);

  useEffect(() => {
    if (!selectedMember && !selectedBill && !selectedVote) {
      setQS({ tab: activeTab });
    }
  }, [activeTab, selectedMember, selectedBill, selectedVote]);

  useEffect(() => {
    if (!selectedVote) return;
    const { congress, session, roll } = selectedVote;

    setQS({ congress, session, roll });
    setLoadingVotes(true);
    setError(null);

    fetch(
      `${API_URL}/house/vote-detail?congress=${congress}&session=${session}&roll=${roll}`
    )
      .then(async (r) => {
        if (r.status === 404)
          return { votes: [], meta: null, counts: null, bill: null };
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

  // --- Bill detail view ---
  if (selectedBill) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <NavTabs active="bills" onChange={setActiveTab} />
        <div className="mt-3">
          <BillPage
            billData={selectedBill}
            congress={selectedBill.congress}
            billType={selectedBill.billType}
            billNumber={selectedBill.billNumber}
            onBack={() => {
              setSelectedBill(null);
              setActiveTab("bills");
            }}
            onOpenRoll={(v) => {
              // Don't navigate away - just open the vote modal
              setSelectedVote(v);
            }}
          />
        </div>

        {/* Vote detail modal - can open from bill page */}
        {selectedVote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full my-8">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-bold">Roll Call Details</h2>
                <button
                  onClick={() => setSelectedVote(null)}
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>
              <div className="p-4">
                {loadingVotes ? (
                  <LoadingSpinner message="Loading vote details..." />
                ) : error ? (
                  <ErrorMessage 
                    message={error} 
                    title="Error loading vote details:" 
                    onRetry={() => {
                      if (selectedVote) {
                        setError(null);
                        setLoadingVotes(true);
                        const { congress, session, roll } = selectedVote;
                        fetch(
                          `${API_URL}/house/vote-detail?congress=${congress}&session=${session}&roll=${roll}`
                        )
                          .then(async (r) => {
                            if (r.status === 404)
                              return { votes: [], meta: null, counts: null, bill: null };
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
                      }
                    }}
                  />
                ) : rows.length === 0 ? (
                  <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
                    <p className="text-gray-700">No ballots found for this vote.</p>
                  </div>
                ) : (
                  <VoteDetailContent 
                    meta={meta}
                    bill={bill}
                    counts={counts}
                    rows={rows}
                    onViewBill={(billData) => {
                      setSelectedVote(null);
                      setSelectedBill(billData);
                    }}
                    onViewMember={(bioguideId) => {
                      setSelectedVote(null);
                      setSelectedBill(null);
                      setSelectedMember(bioguideId);
                      setActiveTab("members");
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Member detail view ---
  if (selectedMember) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <NavTabs active="members" onChange={setActiveTab} />
        <div className="mt-3 mb-3">
          <button
            type="button"
            onClick={() => {
              setSelectedMember(null);
              setActiveTab("members");
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 cursor-pointer"
          >
            ← Back to Members
          </button>
        </div>
        <MemberPage bioguideId={selectedMember} congress={119} session={1} />
      </div>
    );
  }

  // --- Main tabbed view ---
  return (
    <div className="p-4 max-w-6xl mx-auto">
      <NavTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "bills" && (
        <div className="mt-4">
          <div className="mb-4">
            <h1 className="m-0 mb-2 text-2xl font-bold">📋 Early Bills</h1>
            <p className="m-0 text-gray-500 text-sm leading-relaxed">
              Bills that haven't been voted on yet.
            </p>
          </div>
          <BillsWithoutVotes onSelectBill={(bill) => setSelectedBill(bill)} />
        </div>
      )}

      {activeTab === "votes" && (
        <div className="mt-4">
          <div className="mb-4">
            <h1 className="m-0 mb-2 text-2xl font-bold">🗳️ House Roll-Call Votes</h1>
            <p className="m-0 text-gray-500 text-sm leading-relaxed">
              Bills that have been voted on by the House. View voting records and outcomes.
            </p>
          </div>
          <VotedBillsTable
            congress={119}
            session={1}
            onSelectVote={(vote) => {
              setSelectedVote(vote);
              setSelectedMember(null);
              setSelectedBill(null);
            }}
            onSelectBill={(bill) => {
              setSelectedBill(bill);
              setSelectedMember(null);
            }}
          />
        </div>
      )}

      {activeTab === "members" && (
        <div className="mt-4">
          <div className="mb-4">
            <h1 className="m-0 mb-2 text-2xl font-bold">👥 Members of Congress</h1>
            <p className="m-0 text-gray-500 text-sm leading-relaxed">
              Search for representatives to view their voting records and positions.
            </p>
          </div>
          
          <div className="mb-6">
            <MemberSearch
              onSelect={(id) => id && setSelectedMember(id.toUpperCase())}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white border border-gray-300 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">💡 How to Use</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>• Search by name, state (e.g., "CA"), or party (D/R) above</li>
                <li>• Click on a member to see their complete voting history</li>
                <li>• View how they voted on specific bills and resolutions</li>
                <li>• Track their positions across different legislative sessions</li>
              </ul>
            </div>

            <div className="bg-white border border-gray-300 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3">📊 Quick Stats</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span>House Members:</span>
                  <strong>435</strong>
                </div>
                <div className="flex justify-between">
                  <span>Current Congress:</span>
                  <strong>119th (2025-2027)</strong>
                </div>
                <div className="flex justify-between">
                  <span>Voting Records:</span>
                  <strong>Available</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-2">💡 Tip</h3>
            <p className="text-sm text-blue-800">
              You can also access member pages directly from the Votes tab by clicking on any representative's name in the voting tables.
            </p>
          </div>
        </div>
      )}

      {/* Vote detail modal - from votes tab */}
      {selectedVote && activeTab === "votes" && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full my-8">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Roll Call Details</h2>
              <button
                onClick={() => setSelectedVote(null)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4">
              {loadingVotes ? (
                <LoadingSpinner message="Loading vote details..." />
              ) : error ? (
                <ErrorMessage 
                  message={error} 
                  title="Error loading vote details:" 
                  onRetry={() => {
                    if (selectedVote) {
                      setError(null);
                      setLoadingVotes(true);
                      const { congress, session, roll } = selectedVote;
                      fetch(
                        `${API_URL}/house/vote-detail?congress=${congress}&session=${session}&roll=${roll}`
                      )
                        .then(async (r) => {
                          if (r.status === 404)
                            return { votes: [], meta: null, counts: null, bill: null };
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
                    }
                  }}
                />
              ) : rows.length === 0 ? (
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
                  <p className="text-gray-700">No ballots found for this vote.</p>
                </div>
              ) : (
                <VoteDetailContent 
                  meta={meta}
                  bill={bill}
                  counts={counts}
                  rows={rows}
                  onViewBill={(billData) => {
                    setSelectedVote(null);
                    setSelectedBill(billData);
                  }}
                  onViewMember={(bioguideId) => {
                    setSelectedVote(null);
                    setSelectedMember(bioguideId);
                    setActiveTab("members");
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VoteDetailContent({ meta, bill, counts, rows, onViewBill, onViewMember }) {
  // Construct PDF URL if we have the necessary info
  const pdfUrl = meta?.congress && meta?.legislationType && meta?.legislationNumber
    ? `https://www.congress.gov/${meta.congress}/bills/${meta.legislationType.toLowerCase()}${meta.legislationNumber}/BILLS-${meta.congress}${meta.legislationType.toLowerCase()}${meta.legislationNumber}eh.pdf`
    : null;

  return (
    <div>
      {meta && (
        <div className="mb-3 text-sm">
          <div className="mb-2">
            <span className="italic">{meta.question || "(No question)"}</span>
          </div>
          <div className="mb-2">
            <strong>{meta.legislationType} {meta.legislationNumber}</strong>
            {" — "}
            <span>{bill?.title || meta.title || "(No title)"}</span>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <span>Result: <em>{meta.result}</em></span>
            {meta.source && (
              <>
                •
                <a
                  href={meta.source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  Clerk source
                </a>
              </>
            )}
            {meta.legislationUrl && (
              <>
                •
                <a
                  href={meta.legislationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  Congress.gov
                </a>
              </>
            )}
            •
            <button
              type="button"
              onClick={() => onViewBill?.({
                congress: meta.congress,
                billType: (meta.legislationType || "").toLowerCase(),
                billNumber: String(meta.legislationNumber || ""),
              })}
              className="text-blue-600 underline hover:text-blue-800"
            >
              View analysis
            </button>
            {pdfUrl && (
              <>
                •
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  View PDF
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {counts && (
        <div className="mb-3 text-sm text-gray-700 flex gap-3">
          <span>Yea: <strong>{counts.yea}</strong></span>
          <span>Nay: <strong>{counts.nay}</strong></span>
          <span>Present: <strong>{counts.present}</strong></span>
          <span>Not Voting: <strong>{counts.notVoting}</strong></span>
        </div>
      )}

      <VotesTable
        rows={rows}
        onOpenMember={(bioguideId) => bioguideId && onViewMember?.(bioguideId)}
      />
    </div>
  );
}

function NavTabs({ active = "bills", onChange }) {
  const getTabClasses = (isActive) =>
    `px-4 py-2.5 rounded-lg border border-gray-300 cursor-pointer font-semibold transition-colors ${
      isActive ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <div className="flex gap-2 flex-wrap border-b border-gray-200 pb-4">
      <button
        className={getTabClasses(active === "bills")}
        onClick={() => onChange?.("bills")}
      >
        📋 Bills
      </button>
      <button
        className={getTabClasses(active === "votes")}
        onClick={() => onChange?.("votes")}
      >
        🗳️ Votes
      </button>
      <button
        className={getTabClasses(active === "members")}
        onClick={() => onChange?.("members")}
      >
        👥 Members
      </button>
    </div>
  );
}
