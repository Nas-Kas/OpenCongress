import { useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";

// classify result strings so we can filter / analyze
function classifyResult(result) {
  const s = (result || "").toLowerCase();
  if (s.includes("pass") || s.includes("agreed")) return "passed";
  if (s.includes("fail") || s.includes("reject")) return "failed";
  return "other";
}

export default function MemberPage({ bioguideId, congress = 119, session = 1 }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const [fPos, setFPos] = useState("all");
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
    if (!data) return;

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

  // Fetch data
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(
      `http://127.0.0.1:8000/member/${bioguideId}/house-votes?congress=${congress}&session=${session}&window=200`,
      { signal: ctrl.signal }
    )
      .then((r) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
      .then(setData)
      .catch((e) => { if (e.name !== "AbortError") setErr(String(e)); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [bioguideId, congress, session]);

  const votes = useMemo(() => data?.votes ?? [], [data]);

  const uniqueTypes = useMemo(() => {
    const s = new Set();
    for (const v of votes) if (v.legislationType) s.add(v.legislationType);
    return Array.from(s);
  }, [votes]);

  const filtered = useMemo(() => {
    let list = votes;
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (v) =>
          (v.title || "").toLowerCase().includes(needle) ||
          (v.question || "").toLowerCase().includes(needle)
      );
    }
    if (fPos !== "all") list = list.filter((v) => v.position === fPos);
    if (fRes !== "all") list = list.filter((v) => classifyResult(v.result) === fRes);
    if (fType !== "all") list = list.filter((v) => (v.legislationType || "") === fType);
    if (from) list = list.filter((v) => (v.started || "").slice(0, 10) >= from);
    if (to) list = list.filter((v) => (v.started || "").slice(0, 10) <= to);
    return list;
  }, [votes, q, fPos, fRes, fType, from, to]);

  // analysis (based on filtered set)
  const analysis = useMemo(() => {
    const total = filtered.length;
    const present = filtered.filter((v) => v.position === "Present").length;
    const notv = filtered.filter((v) => v.position === "Not Voting").length;
    const yeas = filtered.filter((v) => v.position === "Yea").length;
    const nays = filtered.filter((v) => v.position === "Nay").length;

    const contested = filtered.filter((v) => v.position === "Yea" || v.position === "Nay");
    let aligned = 0;
    for (const v of contested) {
      const cls = classifyResult(v.result);
      if (cls === "passed" && v.position === "Yea") aligned++;
      else if (cls === "failed" && v.position === "Nay") aligned++;
    }
    const alignPct = contested.length ? Math.round((aligned / contested.length) * 100) : null;
    const attendance = total ? Math.round(((total - notv) / total) * 100) : null;
    const yeaRate = contested.length ? Math.round((yeas / contested.length) * 100) : null;

    return { total, present, notv, yeas, nays, contested: contested.length, aligned, alignPct, attendance, yeaRate };
  }, [filtered]);

  const setQuickPos = (p) => setFPos((cur) => (cur === p ? "all" : p));

  if (loading) return <p>Loading member…</p>;
  if (err) return <p style={{ color: 'red' }}>Error: {err}</p>;
  if (!data) return <p>No data.</p>;

  const { profile, stats } = data;

  const headerLabels = ["Roll", "Bill", "Question", "Chamber Result", "Member Vote", "Date"];

  return (
    <div style={{ padding: 4 }}>
      {/* Header */}
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        {profile?.imageUrl && (
          <img
            src={profile.imageUrl}
            alt={profile.name}
            width={56}
            height={56}
            style={{ borderRadius: 8 }}
          />
        )}
        <div>
          <h2 style={{ margin: 0 }}>{profile?.name}</h2>
          <div style={{ color: '#444' }}>
            {profile?.party} • {profile?.state} • {profile?.bioguideId}
          </div>

          {/* Clickable chips */}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            <Chip color="#dbeafe" onClick={() => setQuickPos("Yea")}>Yea {stats?.yea ?? 0}</Chip>
            <Chip color="#fee2e2" onClick={() => setQuickPos("Nay")}>Nay {stats?.nay ?? 0}</Chip>
            <Chip color="#e5e7eb" onClick={() => setQuickPos("Present")}>Present {stats?.present ?? 0}</Chip>
            <Chip color="#fef3c7" onClick={() => setQuickPos("Not Voting")}>Not Voting {stats?.notVoting ?? 0}</Chip>
            {analysis.alignPct !== null && (
              <Chip color="#ecfccb" title="When the chamber outcome was clear (Passed/Failed), how often did this member vote with the outcome?">
                Aligned w/ Chamber {analysis.alignPct}%
              </Chip>
            )}
            {analysis.attendance !== null && (
              <Chip color="#faf5ff" title="Attendance = not 'Not Voting'">
                Attendance {analysis.attendance}%
              </Chip>
            )}
            {analysis.yeaRate !== null && (
              <Chip color="#dcfce7" title="Among Yea/Nay votes only">
                Yea rate {analysis.yeaRate}%
              </Chip>
            )}
          </div>
        </div>
      </header>

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
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr .8fr .8fr .8fr .8fr", gap: 8, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by bill title or question…"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <select value={fPos} onChange={(e) => setFPos(e.target.value)} style={selStyle}>
            <option value="all">All positions</option>
            <option value="Yea">Yea</option>
            <option value="Nay">Nay</option>
            <option value="Present">Present</option>
            <option value="Not Voting">Not Voting</option>
          </select>
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
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selStyle} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selStyle} />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>
          Showing <strong>{filtered.length}</strong> of {votes.length} votes
          {q && <> • search: “{q}”</>}
          {fPos !== "all" && <> • position: {fPos}</>}
          {fRes !== "all" && <> • result: {fRes}</>}
          {fType !== "all" && <> • type: {fType}</>}
          {(from || to) && <> • date: {from || "…"}–{to || "…"}</>}
          {(q || fPos !== "all" || fRes !== "all" || fType !== "all" || from || to) && (
            <> • <button onClick={() => { setQ(""); setFPos("all"); setFRes("all"); setFType("all"); setFrom(""); setTo(""); }} style={{ border: 0, background: "transparent", color: "#1d4ed8", textDecoration: "underline", cursor: "pointer" }}>reset</button></>
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
                gridTemplateColumns: gridTemplate || "80px 1.5fr 2fr 1fr 1fr 120px",
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
                <tr key={v.roll} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td>#{v.roll}</td>
                  <td>
                    {v.legislationUrl ? (
                      <a
                        href={v.legislationUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#1d4ed8", textDecoration: "underline" }}
                      >
                        {v.title
                          ? `${v.title} — ${v.legislationType} ${v.legislationNumber}`
                          : `${v.legislationType ?? ""} ${v.legislationNumber ?? ""}`.trim()}
                      </a>
                    ) : (
                      v.title
                        ? `${v.title} — ${v.legislationType} ${v.legislationNumber}`
                        : `${v.legislationType ?? ""} ${v.legislationNumber ?? ""}`.trim()
                    )}
                  </td>
                  <td>{v.question || ""}</td>
                  <td>{v.result}</td>
                  <td>
                    <span style={{
                      padding: "2px 6px",
                      background: v.position === 'Yea' ? '#d1fae5'
                               : v.position === 'Nay' ? '#fee2e2'
                               : v.position === 'Present' ? '#e5e7eb'
                               : '#fef3c7',
                      borderRadius: 6,
                      display: "inline-block"
                    }}>
                      {v.position || '—'}
                    </span>
                  </td>
                  <td>{v.started?.slice(0,10) ?? ''}</td>
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
        fontWeight: 600
      }}
    >
      {children}
    </button>
  );
}
