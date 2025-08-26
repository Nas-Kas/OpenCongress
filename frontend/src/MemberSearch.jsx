import { useEffect, useRef, useState } from "react";

export default function MemberSearch({ onSelect, placeholder = "Search members by name, ID, state, or party…" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const abortRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      try {
        const r = await fetch(`http://127.0.0.1:8000/search/members?q=${encodeURIComponent(q)}&limit=10`, {
          signal: abortRef.current.signal
        });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = await r.json();
        setResults(data || []);
        setOpen(true);
        setHighlight(0);
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const choose = (row) => {
    setOpen(false);
    setQ(`${row.name} (${row.bioguideId})`);
    onSelect?.(row.bioguideId);
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} style={{ position: "relative", width: 360 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", width: "100%" }}
      />
      {open && results.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            zIndex: 10,
            maxHeight: 300,
            overflowY: "auto"
          }}
        >
          {results.map((r, i) => (
            <div
              key={r.bioguideId}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(r); }} // prevent blur
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 10px",
                background: i === highlight ? "#f1f5f9" : "white",
                cursor: "pointer"
              }}
            >
              {r.imageUrl ? (
                <img src={r.imageUrl} alt="" width={28} height={28} style={{ borderRadius: 6, flex: "0 0 auto" }} />
              ) : (
                <div style={{
                  width: 28, height: 28, borderRadius: 6, background: "#e5e7eb",
                  display: "grid", placeItems: "center", fontSize: 12, color: "#374151"
                }}>
                  {r.name?.[0] || "?"}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name}
                </div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {r.party} • {r.state} • {r.bioguideId}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
