import { useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";

// classify result strings so we can filter / analyze
function classifyResult(result) {
  const s = (result || "").toLowerCase();
  if (s.includes("pass") || s.includes("agreed")) return "passed";
  if (s.includes("fail") || s.includes("reject")) return "failed";
  return "other";
}

export default function VotedBillsTable({ congress = 119, session = 1, onSelectVote, onSelectBill }) {
  const [data, setData] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const [fRes, setFRes] = useState("all");
  const [fType, setFType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtersRef = useRef(null);
  const scrollRef = useRef(null); 
  const tableRef = useRef(null);
  const theadRef = useRef(null);

  const [stickyTop, setStickyTop] = useState(0);
  const [gridTemplate, setGridTemplate] = useState(""); // CSS grid template columns for overlay
  const [overlayWidth, setOverlayWidth] = useState(0);  // px; keeps overlay width in sync

  // Measure filter bar height live (so header sits just below it)
  useLayoutEffect(() => {
    let raf = 0;
    const calcTop = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = filtersRef.current;
        if (!el) return;
        const styles = getComputedStyle(el);
        const mb = parseFloat(styles.marginBottom) || 0;
        setStickyTop(el.getBoundingClientRect().height + mb + 1); // +1 buffer
      });
    };
    const ro = "ResizeObserver" in window ? new ResizeObserver(calcTop) : null;
    if (ro && filtersRef.current) ro.observe(filtersRef.current);

    calcTop();
    window.addEventListener("resize", calcTop);
    window.addEventListener("orientationchange", calcTop);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", calcTop);
      window.removeEventListener("orientationchange", calcTop);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Measure table header column widths and total width for the overlay header
  useLayoutEffect(() => {
    if (!data.length) return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const thead = theadRef.current;
        const table = tableRef.current;
        if (!thead || !table) return;

        const ths = Array.from(thead.querySelectorAll("th"));
        if (!ths.length) return;

        const widths = ths.map((th) => Math.ceil(th.getBoundingClientRect().width));
        const template = widths.map((w) => `${w}px`).join(" ");
        setGridTemplate(template);
        setOverlayWidth(Math.ceil(table.getBoundingClientRect().width));
      });
    };

    // Run after first paint
    measure();

    // Watch table/thead for size changes (fonts, scrollbars, content wrap)
    const roOK = "ResizeObserver" in window;
    const roTable = roOK ? new ResizeObserver(measure) : null;
    const roHead  = roOK ? new ResizeObserver(measure) : null;
    if (roTable && tableRef.current) roTable.observe(tableRef.current);
    if (roHead && theadRef.current) roHead.observe(theadRef.current);

    // Also on window resizes and horizontal scroll wrapper resizes
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    // If the browser supports font loading events, remeasure on ready
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    return () => {
      if (roTable) roTable.disconnect();
      if (roHead) roHead.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      cancelAnimationFrame(raf);
    };
  }, [data]);

  // Fetch voted bills data
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData([]);

    fetch(
      `http://127.0.0.1:8000/house/votes?congress=${congress}&session=${session}&limit=200`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then((response) => setData(response.votes || []))
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [congress, session]);

  const uniqueTypes = useMemo(() => {
    const s = new Set();
    for (const v of data) if (v.legislationType) s.add(v.legislationType);
    return Array.from(s);
  }, [data]);

  const filtered = useMemo(() => {
    let list = data;
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (v) =>
          (v.question || "").toLowerCase().includes(needle) ||
          (v.legislationType || "").toLowerCase().includes(needle) ||
          (v.legislationNumber || "").toString().toLowerCase().includes(needle) ||
          (v.title || "").toLowerCase().includes(needle)
      );
    }
    if (fRes !== "all") list = list.filter((v) => classifyResult(v.result) === fRes);
    if (fType !== "all") list = list.filter((v) => (v.legislationType || "") === fType);
    if (from) list = list.filter((v) => (v.started || "").slice(0, 10) >= from);
    if (to) list = list.filter((v) => (v.started || "").slice(0, 10) <= to);
    return list;
  }, [data, q, fRes, fType, from, to]);

  // analysis (based on filtered set)
  const analysis = useMemo(() => {
    const total = filtered.length;
    const passed = filtered.filter((v) => classifyResult(v.result) === "passed").length;
    const failed = filtered.filter((v) => classifyResult(v.result) === "failed").length;
    const other = total - passed - failed;
    
    const typeBreakdown = {};
    for (const v of filtered) {
      const type = v.legislationType || "Unknown";
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
    }

    return { total, passed, failed, other, typeBreakdown };
  }, [filtered]);

  const setQuickResult = (r) => setFRes((cur) => (cur === r ? "all" : r));

  if (loading) return <p>Loading voted bills… (Congress {congress}, Session {session})</p>;
  if (err) return (
    <div>
      <p style={{ color: 'red' }}>Error loading voted bills: {err}</p>
      <p style={{ fontSize: 12, color: '#666' }}>
        Trying to fetch: http://127.0.0.1:8000/house/votes?congress={congress}&session={session}&limit=200
      </p>
    </div>
  );
  if (!data.length) return (
    <div>
      <p>No voted bills found.</p>
      <p style={{ fontSize: 12, color: '#666' }}>
        Searched Congress {congress}, Session {session}. Make sure the backend is running and has data.
      </p>
    </div>
  );

  const headerLabels = ["Roll", "Bill", "Question", "Result", "Vote Counts", "Date"];

  return (
    <div style={{ padding: 4 }}>
      {/* Summary Stats */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
          <Chip color="#dcfce7" onClick={() => setQuickResult("passed")}>
            Passed {analysis.passed}
          </Chip>
          <Chip color="#fee2e2" onClick={() => setQuickResult("failed")}>
            Failed {analysis.failed}
          </Chip>
          <Chip color="#e5e7eb" onClick={() => setQuickResult("other")}>
            Other {analysis.other}
          </Chip>
          <Chip color="#dbeafe">
            Total {analysis.total}
          </Chip>
        </div>
        
        {Object.keys(analysis.typeBreakdown).length > 1 && (
          <div style={{ fontSize: 12, color: "#666" }}>
            Bill types: {Object.entries(analysis.typeBreakdown)
              .sort(([,a], [,b]) => b - a)
              .map(([type, count]) => `${type} (${count})`)
              .join(" • ")}
          </div>
        )}
      </div>

      {/* Filters */}
      <div
        ref={filtersRef}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "white",
          padding: "8px 0",
          borderBottom: "1px solid #eee",
          marginBottom: 8
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr .8fr .8fr .8fr .8fr", gap: 8, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by bill title, question, type, or number…"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <select value={fRes} onChange={(e) => setFRes(e.target.value)} style={selStyle}>
            <option value="all">Any result</option>
            <option value="passed">Passed/Agreed</option>
            <option value="failed">Failed/Rejected</option>
            <option value="other">Other</option>
          </select>
          <select value={fType} onChange={(e) => setFType(e.target.value)} style={selStyle}>
            <option value="all">All bill types</option>
            {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selStyle} placeholder="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selStyle} placeholder="To date" />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>
          Showing <strong>{filtered.length}</strong> of {data.length} votes
          {q && <> • search: "{q}"</>}
          {fRes !== "all" && <> • result: {fRes}</>}
          {fType !== "all" && <> • type: {fType}</>}
          {(from || to) && <> • date: {from || "…"}–{to || "…"}</>}
          {(q || fRes !== "all" || fType !== "all" || from || to) && (
            <> • <button onClick={() => { setQ(""); setFRes("all"); setFType("all"); setFrom(""); setTo(""); }} style={{ border: 0, background: "transparent", color: "#1d4ed8", textDecoration: "underline", cursor: "pointer" }}>reset</button></>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p>No votes match your filters.</p>
      ) : (
        <div ref={scrollRef} style={{ overflowX: "auto", position: "relative" }}>
          <div
            style={{
              position: "sticky",
              top: stickyTop,
              zIndex: 8, // below filters (10) / above body
              background: "white",
              boxShadow: "0 1px 0 #eee",
              // keep width in sync with table width so horizontal scroll aligns
              width: overlayWidth ? `${overlayWidth}px` : "100%",
              pointerEvents: "none", // let clicks go through to the table links
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate || "80px 2fr 2.5fr 1fr 1.2fr 120px",
                gap: 0,
                fontWeight: 700,
                padding: "6px 8px",
              }}
            >
            </div>
          </div>

          {/* The real table (non-sticky header kept for semantics & measuring) */}
          <table
            ref={tableRef}
            cellPadding={6}
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "100%"
            }}
          >
            <thead ref={theadRef}>
              <tr>
                {headerLabels.map((h) => (
                  <th key={h} align="left" style={{ fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={`${v.congress}-${v.session}-${v.roll}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td>
                    <button
                      onClick={() => onSelectVote && onSelectVote({
                        congress: v.congress,
                        session: v.session,
                        roll: v.roll
                      })}
                      style={{ 
                        color: "#1d4ed8", 
                        textDecoration: "underline",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        font: "inherit"
                      }}
                      title="View vote details"
                    >
                      #{v.roll}
                    </button>
                  </td>
                  <td>
                    {v.legislationType && v.legislationNumber ? (
                      <button
                        onClick={() => onSelectBill && onSelectBill({
                          congress: v.congress,
                          billType: (v.legislationType || "").toLowerCase().replace(/\s+/g, ""),
                          billNumber: String(v.legislationNumber || "")
                        })}
                        style={{ 
                          color: "#1d4ed8", 
                          textDecoration: "underline",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          font: "inherit",
                          textAlign: "left",
                          lineHeight: 1.3
                        }}
                        title="View bill details"
                      >
                        {v.title ? (
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {v.title}
                            </div>
                            <div style={{ fontSize: 12, color: "#666", fontWeight: 400 }}>
                              {v.legislationType} {v.legislationNumber}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontWeight: 600 }}>
                            {v.legislationType} {v.legislationNumber}
                          </div>
                        )}
                      </button>
                    ) : (
                      <span style={{ color: "#666" }}>No bill info</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{v.question || "—"}</td>
                  <td>
                    <span style={{
                      padding: "2px 6px",
                      background: classifyResult(v.result) === 'passed' ? '#dcfce7'
                               : classifyResult(v.result) === 'failed' ? '#fee2e2'
                               : '#f3f4f6',
                      borderRadius: 6,
                      display: "inline-block",
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {v.result || "—"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <span style={{ color: "#059669" }}>Y: {v.yeaCount || 0}</span>
                    {" • "}
                    <span style={{ color: "#dc2626" }}>N: {v.nayCount || 0}</span>
                    {(v.presentCount > 0 || v.notVotingCount > 0) && (
                      <>
                        {" • "}
                        <span style={{ color: "#6b7280" }}>
                          P: {v.presentCount || 0} • NV: {v.notVotingCount || 0}
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "#666" }}>
                    {v.started?.slice(0,10) ?? '—'}
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

const selStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" };

function Chip({ children, color = "#eef2ff", onClick, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        border: "1px solid #e5e7eb",
        background: color,
        borderRadius: 999,
        padding: "4px 10px",
        cursor: onClick ? "pointer" : "default",
        fontWeight: 600,
        fontSize: 12
      }}
    >
      {children}
    </button>
  );
}