import { useEffect, useMemo, useState } from "react";
import VotePicker from "./VotePicker";
import VotesTable from "./VotesTable";
import VotedBillsTable from "./VotedBillsTable";
import MemberPage from "./MemberPage";
import MemberSearch from "./MemberSearch";
import BillPage from "./BillPage";
import BillsWithoutVotes from "./BillsWithoutVotes";
import { LoadingSpinner, ErrorMessage } from "./components";


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


  const [showBillsWithoutVotes, setShowBillsWithoutVotes] = useState(false);

  const [showVotedBillsList, setShowVotedBillsList] = useState(true);

  const activeTab = useMemo(() => {
    if (showBillsWithoutVotes) return "bills";
    if (selectedMember) return "member";
    return "rolls";
  }, [selectedMember, showBillsWithoutVotes]);

  useEffect(() => {
    const qs = getQS();
    const member = qs.get("member");
    const congress = qs.get("congress");
    const session = qs.get("session");
    const roll = qs.get("roll");
    const billType = qs.get("billType");
    const billNumber = qs.get("billNumber");
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
        // title: qs.get("title") || null,
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

  useEffect(() => {
    if (selectedMember) setQS({ member: selectedMember });
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
    if (showBillsWithoutVotes) setQS({ bills: "true" });
  }, [showBillsWithoutVotes]);

  useEffect(() => {
    if (!selectedVote) return;
    const { congress, session, roll } = selectedVote;

    setQS({ congress, session, roll });
    setLoadingVotes(true);
    setError(null);

    fetch(
      `http://127.0.0.1:8000/house/vote-detail?congress=${congress}&session=${session}&roll=${roll}`
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

  if (showBillsWithoutVotes) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <NavTabs
          active="bills"
          onChange={(tab) => {
            if (tab === "rolls") {
              setShowBillsWithoutVotes(false);
              setQS({});
            } else if (tab === "member") {
              setShowBillsWithoutVotes(false);
              setSelectedMember("C001130");
            }
          }}
        />
        <BillsWithoutVotes onSelectBill={(bill) => setSelectedBill(bill)} />
      </div>
    );
  }

  // --- Bill view branch ---
  if (selectedBill) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <BillPage
          billData={selectedBill}
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
      <div className="p-4 max-w-5xl mx-auto">
        <NavTabs
          active="member"
          onChange={(tab) => {
            if (tab === "rolls") {
              setSelectedMember(null);
              const qs = getQS();
              const c = qs.get("congress"),
                s = qs.get("session"),
                r = qs.get("roll");
              if (!c || !s || !r) setQS({});
            } else if (tab === "bills") {
              setSelectedMember(null);
              setShowBillsWithoutVotes(true);
            }
          }}
        />
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setSelectedMember(null)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 cursor-pointer"
          >
            ← Back
          </button>
        </div>
        <MemberPage bioguideId={selectedMember} congress={119} session={1} />
      </div>
    );
  }

  // --- Main default view ---
  const displayQuestion =
    (meta?.question && meta.question.trim()) ||
    (selectedVote?.question && selectedVote.question.trim()) ||
    "(No question)";

  const billId = meta
    ? `${meta.legislationType} ${meta.legislationNumber}`
    : "";
  const displayTitle =
    bill?.title ||
    (selectedVote?.title && selectedVote.title.trim()) ||
    billId;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <NavTabs
        active={activeTab}
        onChange={(tab) => {
          if (tab === "member") {
            setSelectedMember(null);
            setQS({ member: null });
          } else if (tab === "bills") {
            setShowBillsWithoutVotes(true);
            setSelectedMember(null);
            setSelectedBill(null);
          }
        }}
      />

      <div className="mt-2 mb-4">
        <h1 className="m-0 mb-2 text-2xl font-bold">🗳️ House Roll-Call Votes</h1>
        <p className="m-0 text-gray-500 text-sm leading-relaxed">
          Bills that have been voted on by the House. For bills that haven't
          been voted on yet, check the "📋 Early Bills" tab.
        </p>
      </div>

      {/* View toggle */}
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="flex gap-1">
          <button
            onClick={() => {
              setShowVotedBillsList(true);
            }}
            className={`px-3 py-2 rounded-lg border border-gray-300 cursor-pointer font-semibold ${showVotedBillsList
              ? "bg-blue-50 text-blue-600"
              : "bg-transparent text-gray-900"
              }`}
          >
            📊 Vote Overview
          </button>
          <button
            onClick={() => {
              setShowVotedBillsList(false);
            }}
            className={`px-3 py-2 rounded-lg border border-gray-300 cursor-pointer font-semibold ${!showVotedBillsList
              ? "bg-blue-50 text-blue-600"
              : "bg-transparent text-gray-900"
              }`}
          >
            👥 Vote by Member
          </button>
        </div>
        <div className="flex-1">
          <MemberSearch
            onSelect={(id) => id && setSelectedMember(id.toUpperCase())}
          />
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
            console.log("Selected bill from table:", bill);
            setSelectedBill(bill);
            setSelectedMember(null);
          }}
        />
      ) : (
        <>
          <div className="mb-4">
            <VotePicker
              onSelect={(payload) => {
                setSelectedVote(payload);
                setSelectedMember(null);
                setSelectedBill(null);
              }}
            />
          </div>

          {error && (
            <ErrorMessage 
              message={error} 
              title="Error loading vote details:" 
              onRetry={() => {
                if (selectedVote) {
                  setError(null);
                  setLoadingVotes(true);
                  const { congress, session, roll } = selectedVote;
                  fetch(
                    `http://127.0.0.1:8000/house/vote-detail?congress=${congress}&session=${session}&roll=${roll}`
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
          )}

          {!selectedVote ? (
            <div className="mt-4 p-6 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-gray-700 mb-2">Select a vote to see details</p>
              <p className="text-sm text-gray-500">Use the vote picker above to select a specific roll call vote</p>
            </div>
          ) : loadingVotes ? (
            <LoadingSpinner message="Loading vote details..." />
          ) : rows.length === 0 ? (
            <div className="mt-4 p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-gray-700">No ballots found for this vote.</p>
            </div>
          ) : (
            <div className="mt-4">
              {meta && (
                <div className="mb-2 text-sm">
                  <span className="italic">{displayQuestion}</span>{" "}
                  — <strong>{billId}</strong> — <span>{displayTitle}</span>
                  {" • "}Result: <em>{meta.result}</em>{" "}
                  {meta.source && (
                    <>
                      •{" "}
                      <a
                        href={meta.source}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline hover:text-blue-800"
                      >
                        Clerk source
                      </a>
                    </>
                  )}
                  {meta.legislationUrl && (
                    <>
                      {" "}&bull;{" "}
                      <a
                        href={meta.legislationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline hover:text-blue-800"
                      >
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
                <div className="mb-2 text-xs text-gray-700">
                  Yea: {counts.yea} · Nay: {counts.nay} · Present:{" "}
                  {counts.present} · Not Voting: {counts.notVoting}
                </div>
              )}

              <VotesTable
                rows={rows}
                onOpenMember={(bioguideId) =>
                  bioguideId && setSelectedMember(bioguideId)
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NavTabs({ active = "rolls", onChange }) {
  const getTabClasses = (isActive) =>
    `px-3 py-2 rounded-lg border border-gray-300 cursor-pointer font-semibold ${isActive ? "bg-blue-50 text-blue-600" : "bg-transparent text-gray-900"
    }`;

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        className={getTabClasses(active === "rolls")}
        onClick={() => onChange?.("rolls")}
      >
        🗳️ Voted Bills
      </button>
      <button
        className={getTabClasses(active === "member")}
        onClick={() => onChange?.("member")}
      >
        👤 Member
      </button>
      <button
        className={getTabClasses(active === "bills")}
        onClick={() => onChange?.("bills")}
      >
        📋 Early Bills
      </button>
    </div>
  );
}
