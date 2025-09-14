import { useEffect, useMemo, useState } from "react";
import CreateMarket from "./CreateMarket";
import EducationalTooltip, { OddsExplainer } from "./EducationalTooltip";

export default function BillPage({ congress, billType, billNumber, onBack, onOpenRoll }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState(null);

  // Summaries
  const [summaries, setSummaries] = useState([]);
  const [sumErr, setSumErr] = useState(null);
  const [sumLoading, setSumLoading] = useState(true);

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/bill/${congress}/${billType}/${billNumber}/generate-summary`
      );

      if (!response.ok) {
        throw new Error(`Failed to generate summary: ${response.statusText}`);
      }

      const result = await response.json();
      setGeneratedSummary({
        text: result.summary,
        source: "AI Generated",
        date: new Date().toISOString().slice(0, 10),
        analysis: result.analysis
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      alert("Failed to generate summary. Please try again.");
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Betting markets
  const [markets, setMarkets] = useState([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [showCreateMarket, setShowCreateMarket] = useState(false);

  // ---- fetch bill details + vote timeline ----
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(
      `http://127.0.0.1:8000/bill/${congress}/${String(billType).toLowerCase()}/${billNumber}`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [congress, billType, billNumber]);

  useEffect(() => {
    const ctrl = new AbortController();
    setSumLoading(true);
    setSumErr(null);
    setSummaries([]);

    fetch(
      `http://127.0.0.1:8000/bill/${congress}/${String(billType).toLowerCase()}/${billNumber}/summaries`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then((payload) => setSummaries(payload?.summaries || []))
      .catch((e) => { if (e.name !== "AbortError") setSumErr(String(e)); })
      .finally(() => setSumLoading(false));

    return () => ctrl.abort();
  }, [congress, billType, billNumber]);

  // Load betting markets for this bill
  useEffect(() => {
    loadMarkets();
  }, [congress, billType, billNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMarkets = async () => {
    setMarketsLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/markets?status=all&limit=100`);
      const allMarkets = await response.json();

      // Filter markets for this specific bill
      const billMarkets = allMarkets.filter(m =>
        m.congress === congress &&
        m.bill_type === billType.toLowerCase() &&
        m.bill_number === billNumber
      );

      setMarkets(billMarkets);
    } catch (error) {
      console.error("Failed to load markets:", error);
    } finally {
      setMarketsLoading(false);
    }
  };

  const votes = useMemo(() => (data?.votes ?? []), [data]);
  const orderedVotes = useMemo(() => {
    const arr = [...votes];
    arr.sort((a, b) => String(a.started || "").localeCompare(String(b.started || "")));
    return arr;
  }, [votes]);

  const latestSummary = useMemo(() => {
    // Prefer generated summary if available
    if (generatedSummary) return generatedSummary;

    if (!summaries || summaries.length === 0) return null;
    const sorted = [...summaries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return sorted[0];
  }, [summaries, generatedSummary]);

  // ---- small UI helpers ----
  const resultBadge = (result) => {
    const s = (result || "").toLowerCase();
    const passed = s.includes("pass") || s.includes("agreed");
    const failed = s.includes("fail") || s.includes("reject");
    const bg = passed ? "#dcfce7" : failed ? "#fee2e2" : "#e5e7eb";
    return (
      <span style={{ background: bg, padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
        {result || "—"}
      </span>
    );
  };

  const countPills = (c = {}) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Pill color="#d1fae5">Yea {c.yea ?? 0}</Pill>
      <Pill color="#fee2e2">Nay {c.nay ?? 0}</Pill>
      <Pill color="#e5e7eb">Present {c.present ?? 0}</Pill>
      <Pill color="#fef3c7">NV {c.notVoting ?? 0}</Pill>
    </div>
  );

  if (loading) return <LoadingSpinner text="Loading bill details..." />;
  if (err) return (
    <div style={{
      padding: 20,
      background: "#fef2f2",
      border: "1px solid #fecaca",
      borderRadius: 8,
      color: "#dc2626"
    }}>
      <strong>Error loading bill:</strong> {err}
    </div>
  );
  if (!data) return (
    <div style={{
      padding: 20,
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      color: "#6b7280",
      textAlign: "center"
    }}>
      No bill data found.
    </div>
  );

  const { bill } = data;
  const id = `${bill.billType?.toUpperCase()} ${bill.billNumber}`;
  const title = bill.title || id;

  return (
    <div style={{
      padding: "8px 16px",
      maxWidth: "100%",
      margin: "0 auto"
    }}>
      {/* Header */}
      <div style={{
        marginBottom: 20,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        flexWrap: "wrap"
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "white",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            ← Back
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            fontSize: "clamp(18px, 4vw, 24px)",
            lineHeight: 1.3,
            color: "#1f2937"
          }}>
            {title}
          </h1>
        </div>
      </div>

      {/* Meta information */}
      <div style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
      }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>BILL NUMBER</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1f2937" }}>{id}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>INTRODUCED</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
            {bill.introducedDate?.slice(0, 10) || "Unknown"}
          </div>
        </div>
        {bill.publicUrl && (
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>OFFICIAL PAGE</div>
            <a
              href={bill.publicUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#2563eb",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500
              }}
            >
              Congress.gov →
            </a>
          </div>
        )}
      </div>

      {/* Latest action */}
      {bill.latestAction && (
        <LatestActionDisplay latestAction={bill.latestAction} />
      )}

      {/* Text versions */}
      {bill.textVersions && bill.textVersions.length > 0 && (
        <div style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          padding: 16,
          marginBottom: 20
        }}>
          <div style={{
            fontSize: 12,
            color: "#166534",
            fontWeight: 600,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6
          }}>
            📄 BILL TEXT VERSIONS
            <span style={{
              background: "#dcfce7",
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: 11
            }}>
              {bill.textVersions.length} available
            </span>
          </div>
          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap"
          }}>
            {bill.textVersions.map((tv, i) => (
              <a
                key={`${tv.type}-${i}`}
                href={tv.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "6px 12px",
                  background: "#16a34a",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.target.style.background = "#15803d"}
                onMouseOut={(e) => e.target.style.background = "#16a34a"}
              >
                {tv.type}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* --- Summary section (styled) --- */}
      <h3 style={{ marginTop: 16, marginBottom: 8 }}>Summary</h3>
      {sumLoading ? (
        <LoadingSpinner text="Loading summary..." />
      ) : sumErr ? (
        <div style={{
          padding: 16,
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          color: "#dc2626"
        }}>
          <strong>Error loading summaries:</strong> {sumErr}
        </div>
      ) : !latestSummary ? (
        <div style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 16,
          background: "#f8fafc",
          textAlign: "center"
        }}>
          <p style={{ margin: "0 0 12px 0", color: "#6b7280" }}>
            No summary available for this bill.
          </p>
          <button
            onClick={generateSummary}
            disabled={generatingSummary}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #2563eb",
              background: generatingSummary ? "#f3f4f6" : "#2563eb",
              color: generatingSummary ? "#6b7280" : "white",
              cursor: generatingSummary ? "not-allowed" : "pointer",
              fontWeight: 500
            }}
          >
            {generatingSummary ? "Generating..." : "🤖 Generate AI Summary"}
          </button>
          <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#6b7280" }}>
            We'll fetch the bill text and create a summary for you
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              background: "#fafafa"
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <Pill color="#eef2ff">{latestSummary.source || "CRS"}</Pill>
              {latestSummary.date && <Pill>{latestSummary.date}</Pill>}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
              {latestSummary.text}
            </div>
          </div>

          {summaries.length > 1 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>
                View all summaries ({summaries.length})
              </summary>
              <div style={{ marginTop: 8 }}>
                {[...summaries]
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                  .map((s, i) => (
                    <div key={`${s.date}-${i}`} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <Pill color="#eef2ff">{s.source || "CRS"}</Pill>
                        {s.date && <Pill>{s.date}</Pill>}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{s.text}</div>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* --- Educational Analysis Section --- */}
      <BillEducationalAnalysis
        bill={bill}
        congress={congress}
        billType={billType}
        billNumber={billNumber}
        summary={latestSummary}
      />

      {/* --- Betting Markets Section --- */}
      <h3 style={{ marginTop: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
        Betting Markets
        <button
          onClick={() => setShowCreateMarket(!showCreateMarket)}
          style={{
            padding: "4px 8px",
            fontSize: 12,
            background: showCreateMarket ? "#ef4444" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          {showCreateMarket ? "Cancel" : "Create Market"}
        </button>
      </h3>

      {showCreateMarket && (
        <CreateMarket
          congress={congress}
          billType={billType}
          billNumber={billNumber}
          title={title}
          onCreated={(result) => {
            setShowCreateMarket(false);
            loadMarkets();
            alert(`Market created successfully! Market ID: ${result.market_id}`);
          }}
        />
      )}

      {marketsLoading ? (
        <LoadingSpinner text="Loading betting markets..." />
      ) : markets.length === 0 ? (
        <div style={{
          padding: 20,
          background: "#f8fafc",
          border: "1px dashed #cbd5e1",
          borderRadius: 8,
          textAlign: "center",
          color: "#6b7280"
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            No betting markets exist for this bill yet.
          </p>
          <p style={{ margin: "8px 0 0 0", fontSize: 14 }}>
            Create the first market to start predictions!
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {markets.map(market => (
            <div
              key={market.market_id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                background: "#fafafa"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Pill color={market.status === "active" ? "#dcfce7" : "#e5e7eb"}>
                      {market.status.toUpperCase()}
                    </Pill>
                    {market.resolution && (
                      <Pill color="#fef3c7">{market.resolution.toUpperCase()}</Pill>
                    )}
                  </div>

                  {market.description && (
                    <p style={{ margin: "0 0 8px 0", fontSize: 14, color: "#374151" }}>
                      {market.description}
                    </p>
                  )}

                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Volume: ${market.volume.toFixed(2)}
                    {market.deadline && (
                      <span> • Deadline: {new Date(market.deadline).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>PASS</div>
                    <OddsExplainer odds={market.odds?.pass || 1} marketType="bill_passage">
                      <div style={{
                        fontWeight: 600,
                        color: "#10b981",
                        cursor: "help",
                        borderBottom: "1px dotted #10b981"
                      }}>
                        {market.odds?.pass ? `${market.odds.pass.toFixed(2)}x` : "—"}
                      </div>
                    </OddsExplainer>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>FAIL</div>
                    <OddsExplainer odds={market.odds?.fail || 1} marketType="bill_passage">
                      <div style={{
                        fontWeight: 600,
                        color: "#ef4444",
                        cursor: "help",
                        borderBottom: "1px dotted #ef4444"
                      }}>
                        {market.odds?.fail ? `${market.odds.fail.toFixed(2)}x` : "—"}
                      </div>
                    </OddsExplainer>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- Timeline (styled like your member page) --- */}
      <h3 style={{ marginTop: 16, marginBottom: 8 }}>House Roll-Call Timeline</h3>
      {orderedVotes.length === 0 ? (
        <p>No recorded House votes for this bill (in DB).</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            cellPadding={8}
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: 14
            }}
          >
            <thead>
              <tr>
                <th align="left" style={{ fontWeight: 700 }}>Date</th>
                <th align="left" style={{ fontWeight: 700 }}>Session/Roll</th>
                <th align="left" style={{ fontWeight: 700 }}>Question</th>
                <th align="left" style={{ fontWeight: 700 }}>Chamber Result</th>
                <th align="left" style={{ fontWeight: 700 }}>Counts</th>
                <th align="left" style={{ fontWeight: 700 }}></th>
              </tr>
            </thead>
            <tbody>
              {orderedVotes.map((v) => (
                <tr key={`${v.session}-${v.roll}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td>{v.started?.slice(0, 10) ?? "—"}</td>
                  <td>#{v.roll} (S{v.session})</td>
                  <td style={{ minWidth: 260 }}>
                    <LegislativeTermTooltip term={v.question}>
                      {v.question || "—"}
                    </LegislativeTermTooltip>
                  </td>
                  <td>{resultBadge(v.result)}</td>
                  <td>{countPills(v.counts)}</td>
                  <td>
                    {onOpenRoll ? (
                      <button
                        onClick={() => onOpenRoll({ congress, session: v.session, roll: v.roll })}
                        title="Open this roll call"
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "white",
                          borderRadius: 8,
                          padding: "6px 10px",
                          cursor: "pointer"
                        }}
                      >
                        Open roll
                      </button>
                    ) : v.legislationUrl ? (
                      <a href={v.legislationUrl} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                        Clerk source
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pill({ children, color = "#e5e7eb" }) {
  return (
    <span
      style={{
        background: color,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600
      }}
    >
      {children}
    </span>
  );
}

// Latest Action Display Component
function LatestActionDisplay({ latestAction }) {
  // Parse the latest action data properly
  const parseLatestAction = (action) => {
    // Handle different formats of latest action data
    if (typeof action === 'string') {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(action);
        if (typeof parsed === 'object' && parsed !== null) {
          return {
            text: parsed.text || parsed.actionText || action,
            actionDate: parsed.actionDate || parsed.date,
            actionTime: parsed.actionTime || parsed.time
          };
        }
      } catch (e) {
        // If JSON parsing fails, treat as plain text
        return { text: action, actionDate: null, actionTime: null };
      }
    }

    if (typeof action === 'object' && action !== null) {
      return {
        text: action.text || action.actionText || String(action),
        actionDate: action.actionDate || action.date,
        actionTime: action.actionTime || action.time
      };
    }

    return { text: String(action), actionDate: null, actionTime: null };
  };

  const formatActionText = (text) => {
    if (!text) return "No action text available";

    // Clean up common formatting issues
    let cleaned = text.trim();

    // Add periods if missing
    if (!cleaned.match(/[.!?]$/)) {
      cleaned += ".";
    }

    return cleaned;
  };

  const formatDateTime = (date, time) => {
    if (!date) return null;

    try {
      const dateObj = new Date(date);
      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      };

      let formatted = dateObj.toLocaleDateString('en-US', options);

      if (time) {
        // Parse time if available (format: HH:MM:SS)
        const [hours, minutes] = time.split(':');
        const timeObj = new Date();
        timeObj.setHours(parseInt(hours), parseInt(minutes));
        const timeStr = timeObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        formatted += ` at ${timeStr}`;
      }

      return formatted;
    } catch (e) {
      return date; // Fallback to original date string
    }
  };

  const { text, actionDate, actionTime } = parseLatestAction(latestAction);
  const formattedDateTime = formatDateTime(actionDate, actionTime);

  return (
    <div style={{
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      borderRadius: 8,
      padding: 16,
      marginBottom: 20
    }}>
      <div style={{
        fontSize: 12,
        color: "#1e40af",
        fontWeight: 600,
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap"
      }}>
        📋 LATEST ACTION
        {formattedDateTime && (
          <span style={{
            background: "#dbeafe",
            padding: "4px 8px",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500
          }}>
            {formattedDateTime}
          </span>
        )}
      </div>
      <div style={{
        fontSize: 14,
        lineHeight: 1.4,
        color: "#1f2937"
      }}>
        {formatActionText(text)}
      </div>
    </div>
  );
}

// Enhanced loading component with better UX
function LoadingSpinner({ text = "Loading..." }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: 20,
      justifyContent: "center",
      color: "#6b7280"
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: "2px solid #e5e7eb",
        borderTop: "2px solid #2563eb",
        borderRadius: "50%",
        animation: "spin 1s linear infinite"
      }} />
      <span>{text}</span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Legislative term tooltip component  
const LegislativeTermTooltip = ({ term, children }) => {
  const getTermExplanation = (term) => {
    if (!term) return null;

    const termLower = term.toLowerCase();

    // Common legislative terms and their explanations
    const explanations = {
      "on agreeing to the resolution": {
        title: "📜 Agreeing to Resolution",
        content: "A vote to approve a resolution. Resolutions express opinions or set rules but don't become law like bills do."
      },
      "on motion to suspend the rules and pass": {
        title: "⚡ Suspend Rules Motion",
        content: "Fast-track procedure requiring 2/3 majority. Limits debate and amendments but allows quick passage of non-controversial bills."
      },
      "on motion to suspend the rules and pass, as amended": {
        title: "⚡ Suspend Rules (Amended)",
        content: "Fast-track procedure for a bill that was modified. Still requires 2/3 majority but includes changes from the original version."
      },
      "on passage": {
        title: "✅ Final Passage Vote",
        content: "The final vote on whether a bill passes the chamber. This is the main vote that determines if legislation moves forward."
      },
      "on motion to recommit": {
        title: "↩️ Motion to Recommit",
        content: "Last-chance effort by the minority party to send a bill back to committee, often with instructions to make changes."
      },
      "on agreeing to the amendment": {
        title: "📝 Amendment Vote",
        content: "Vote on whether to modify the bill's language. Amendments can add, remove, or change specific provisions."
      },
      "on motion to table": {
        title: "🗃️ Motion to Table",
        content: "Procedural vote to set aside a bill or amendment, effectively killing it without a direct up-or-down vote."
      },
      "on cloture": {
        title: "⏱️ Cloture Vote (Senate)",
        content: "Vote to end debate and proceed to final vote. Requires 60 senators to overcome a filibuster."
      },
      "on the motion to proceed": {
        title: "▶️ Motion to Proceed",
        content: "Senate vote to begin formal consideration of a bill. Can be filibustered, so often needs 60 votes."
      }
    };

    // Check for exact matches first
    if (explanations[termLower]) {
      return explanations[termLower];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(explanations)) {
      if (termLower.includes(key) || key.includes(termLower)) {
        return value;
      }
    }

    // Generic explanations for common patterns
    if (termLower.includes("suspend") && termLower.includes("rules")) {
      return {
        title: "⚡ Suspension of Rules",
        content: "Expedited procedure that requires 2/3 majority but limits debate time and amendments. Used for non-controversial bills."
      };
    }

    if (termLower.includes("amendment")) {
      return {
        title: "📝 Amendment Process",
        content: "Proposed changes to the bill's text. Members can offer amendments to modify, add, or remove provisions."
      };
    }

    if (termLower.includes("recommit")) {
      return {
        title: "↩️ Recommit Motion",
        content: "Attempt to send the bill back to committee, usually by the minority party as a last-ditch effort to change or delay it."
      };
    }

    return null;
  };

  const explanation = getTermExplanation(term);

  if (!explanation) {
    return <span>{children}</span>;
  }

  return (
    <EducationalTooltip
      title={explanation.title}
      content={explanation.content}
      position="top"
    >
      <span style={{
        borderBottom: "1px dotted #6b7280",
        cursor: "help"
      }}>
        {children}
      </span>
    </EducationalTooltip>
  );
};

function BillEducationalAnalysis({ bill, congress, billType, billNumber, summary }) {
  const [activeTab, setActiveTab] = useState("overview");

  // Educational analysis based on bill data
  const getBillTypeExplanation = (type) => {
    const explanations = {
      "hr": {
        title: "House Bill (HR)",
        description: "A bill introduced in the House of Representatives that can become law if passed by both chambers and signed by the President.",
        process: "Must pass House → Senate → President's desk",
        specialRules: "Can originate tax/revenue bills (Constitutional requirement)"
      },
      "s": {
        title: "Senate Bill (S)",
        description: "A bill introduced in the Senate that can become law if passed by both chambers and signed by the President.",
        process: "Must pass Senate → House → President's desk",
        specialRules: "Cannot originate tax/revenue bills"
      },
      "hres": {
        title: "House Resolution (HRES)",
        description: "A resolution that affects only the House of Representatives and does not become law.",
        process: "Only needs House approval",
        specialRules: "Used for House rules, procedures, and opinions"
      },
      "sres": {
        title: "Senate Resolution (SRES)",
        description: "A resolution that affects only the Senate and does not become law.",
        process: "Only needs Senate approval",
        specialRules: "Used for Senate rules, procedures, and opinions"
      },
      "hjres": {
        title: "House Joint Resolution (HJRES)",
        description: "Has the force of law like a bill, often used for constitutional amendments or continuing resolutions.",
        process: "Must pass House → Senate → President (except constitutional amendments)",
        specialRules: "Constitutional amendments go to states, not President"
      },
      "sjres": {
        title: "Senate Joint Resolution (SJRES)",
        description: "Has the force of law like a bill, often used for constitutional amendments or continuing resolutions.",
        process: "Must pass Senate → House → President (except constitutional amendments)",
        specialRules: "Constitutional amendments go to states, not President"
      }
    };
    return explanations[type.toLowerCase()] || explanations["hr"];
  };



  const getPlainEnglishSummary = () => {
    if (!summary?.text) return null;

    // Simple heuristics to make summary more accessible
    const text = summary.text;

    // Better sentence splitting that handles titles and abbreviations
    const sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/) // Split on sentence endings followed by space and capital letter
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());

    if (sentences.length === 0) return null;

    // Find the first substantial sentence (longer than just a title)
    let mainPurpose = sentences[0];
    if (mainPurpose.length < 50 && sentences.length > 1) {
      // If first sentence is too short (likely just a title), combine with next
      mainPurpose = sentences[0] + " " + sentences[1];
    }

    // Ensure it ends with proper punctuation
    if (!mainPurpose.match(/[.!?]$/)) {
      mainPurpose += ".";
    }

    return {
      mainPurpose: mainPurpose,
      keyPoints: sentences.slice(1, 4).map(s => s.trim()).filter(s => s.length > 10),
      complexity: text.length > 1000 ? "high" : text.length > 500 ? "medium" : "low"
    };
  };

  const plainEnglish = getPlainEnglishSummary();
  const typeInfo = getBillTypeExplanation(billType);

  const tabs = [
    { id: "overview", label: "📋 Bill Breakdown", icon: "📋" },
    { id: "language", label: "🔍 Plain English", icon: "🔍" },
    { id: "guide", label: "📚 How to Read This", icon: "📚" }
  ];

  return (
    <div style={{ marginTop: 20, marginBottom: 20 }}>
      <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        🎓 Educational Analysis
        <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 400 }}>
          Learn how to analyze this bill
        </span>
      </h3>

      {/* Tab Navigation */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 16,
        borderBottom: "1px solid #e5e7eb",
        overflowX: "auto"
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              border: "none",
              background: activeTab === tab.id ? "#2563eb" : "transparent",
              color: activeTab === tab.id ? "white" : "#6b7280",
              borderRadius: "6px 6px 0 0",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              whiteSpace: "nowrap",
              transition: "all 0.2s"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0 8px 8px 8px",
        padding: 20,
        background: "white",
        minHeight: 200
      }}>
        {activeTab === "overview" && (
          <div>
            <h4 style={{ margin: "0 0 16px 0", color: "#1f2937" }}>Bill Type & Process</h4>

            <div style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Pill color="#dbeafe">{typeInfo.title}</Pill>
                <span style={{ fontSize: 14, color: "#6b7280" }}>
                  Congress {congress}
                </span>
              </div>

              <p style={{ margin: "0 0 12px 0", lineHeight: 1.5 }}>
                {typeInfo.description}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 14 }}>
                <div>
                  <strong style={{ color: "#374151" }}>Legislative Process:</strong>
                  <div style={{ color: "#6b7280", marginTop: 4 }}>{typeInfo.process}</div>
                </div>
                <div>
                  <strong style={{ color: "#374151" }}>Special Rules:</strong>
                  <div style={{ color: "#6b7280", marginTop: 4 }}>{typeInfo.specialRules}</div>
                </div>
              </div>
            </div>

            <h5 style={{ margin: "16px 0 8px 0", color: "#374151" }}>Key Information</h5>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontWeight: 500 }}>Introduced:</span>
                <span>{bill.introducedDate?.slice(0, 10) || "Unknown"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontWeight: 500 }}>Status:</span>
                <span>{bill.latestAction?.text?.slice(0, 50) || "No recent action"}...</span>
              </div>
              {bill.textVersions && bill.textVersions.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span style={{ fontWeight: 500 }}>Available Text:</span>
                  <span>{bill.textVersions.length} version(s)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "language" && (
          <div>
            <h4 style={{ margin: "0 0 16px 0", color: "#1f2937" }}>Plain English Breakdown</h4>

            {plainEnglish ? (
              <div>
                <div style={{
                  background: "#ecfdf5",
                  border: "1px solid #10b981",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16
                }}>
                  <h5 style={{ margin: "0 0 8px 0", color: "#065f46" }}>What This Bill Does:</h5>
                  <p style={{ margin: 0, lineHeight: 1.5, color: "#374151" }}>
                    {plainEnglish.mainPurpose}
                  </p>
                </div>

                {plainEnglish.keyPoints.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h5 style={{ margin: "0 0 12px 0", color: "#374151" }}>Key Points:</h5>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {plainEnglish.keyPoints.map((point, index) => (
                        <li key={index} style={{ marginBottom: 8, lineHeight: 1.4 }}>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{
                  background: "#fef3c7",
                  border: "1px solid #f59e0b",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 14
                }}>
                  <strong>Complexity Level:</strong> {plainEnglish.complexity.charAt(0).toUpperCase() + plainEnglish.complexity.slice(1)}
                  {plainEnglish.complexity === "high" && " - This bill contains detailed technical language"}
                  {plainEnglish.complexity === "medium" && " - Moderate complexity with some technical terms"}
                  {plainEnglish.complexity === "low" && " - Relatively straightforward language"}
                </div>
              </div>
            ) : (
              <div style={{
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: 8,
                padding: 20,
                textAlign: "center",
                color: "#6b7280"
              }}>
                <p>No summary available to analyze. Check the full bill text for detailed language breakdown.</p>
                {bill.textVersions && bill.textVersions.length > 0 && (
                  <p style={{ marginTop: 12 }}>
                    <strong>Tip:</strong> Read the bill text to understand the specific legal language and provisions.
                  </p>
                )}
              </div>
            )}
          </div>
        )}



        {activeTab === "guide" && (
          <div>
            <h4 style={{ margin: "0 0 16px 0", color: "#1f2937" }}>How to Read This Bill</h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 16
              }}>
                <h5 style={{ margin: "0 0 12px 0", color: "#374151" }}>📋 Bill Structure Guide</h5>
                <div style={{ display: "grid", gap: 12, fontSize: 14 }}>
                  <div>
                    <strong>Title:</strong> Brief description of the bill's main purpose
                  </div>
                  <div>
                    <strong>Preamble:</strong> "Be it enacted..." - formal introduction
                  </div>
                  <div>
                    <strong>Sections:</strong> Numbered parts containing specific provisions
                  </div>
                  <div>
                    <strong>Subsections:</strong> Detailed requirements within each section
                  </div>
                </div>
              </div>

              <div style={{
                background: "#ecfdf5",
                border: "1px solid #10b981",
                borderRadius: 8,
                padding: 16
              }}>
                <h5 style={{ margin: "0 0 12px 0", color: "#065f46" }}>🔍 What to Look For</h5>
                <ul style={{ margin: 0, paddingLeft: 20, color: "#374151" }}>
                  <li><strong>Effective dates:</strong> When the law takes effect</li>
                  <li><strong>Funding sources:</strong> How the bill is paid for</li>
                  <li><strong>Definitions:</strong> Key terms explained</li>
                  <li><strong>Enforcement:</strong> Who implements the law</li>
                  <li><strong>Sunset clauses:</strong> When the law expires</li>
                </ul>
              </div>

              <div style={{
                background: "#fef3c7",
                border: "1px solid #f59e0b",
                borderRadius: 8,
                padding: 16
              }}>
                <h5 style={{ margin: "0 0 12px 0", color: "#92400e" }}>⚠️ Common Confusing Elements</h5>
                <ul style={{ margin: 0, paddingLeft: 20, color: "#374151" }}>
                  <li><strong>"Strike" and "Insert":</strong> Amendments to existing law</li>
                  <li><strong>Cross-references:</strong> References to other laws (USC codes)</li>
                  <li><strong>Technical amendments:</strong> Minor fixes to existing language</li>
                  <li><strong>Whereas clauses:</strong> Background reasoning (in resolutions)</li>
                </ul>
              </div>

              {bill.textVersions && bill.textVersions.length > 0 && (
                <div style={{
                  background: "#eff6ff",
                  border: "1px solid #2563eb",
                  borderRadius: 8,
                  padding: 16
                }}>
                  <h5 style={{ margin: "0 0 12px 0", color: "#1e40af" }}>📖 Reading the Full Text</h5>
                  <p style={{ margin: "0 0 12px 0", color: "#374151" }}>
                    This bill has {bill.textVersions.length} text version(s) available. Start with the most recent version.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {bill.textVersions.map((tv, i) => (
                      <a
                        key={i}
                        href={tv.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "6px 12px",
                          background: "#2563eb",
                          color: "white",
                          textDecoration: "none",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500
                        }}
                      >
                        Read {tv.type} Version
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
