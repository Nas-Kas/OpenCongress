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
    <div ref={boxRef} className="relative w-90">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="px-2.5 py-2 rounded-lg border border-gray-300 w-full"
      />
      {open && results.length > 0 && (
        <div
          role="listbox"
          className="absolute top-[110%] left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-75 overflow-y-auto"
        >
          {results.map((r, i) => (
            <div
              key={r.bioguideId}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(r); }} // prevent blur
              className={`flex gap-2.5 items-center px-2.5 py-2 cursor-pointer ${
                i === highlight ? "bg-slate-100" : "bg-white"
              }`}
            >
              {r.imageUrl ? (
                <img src={r.imageUrl} alt="" width={28} height={28} className="rounded-md flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-md bg-gray-300 grid place-items-center text-xs text-gray-700">
                  {r.name?.[0] || "?"}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                  {r.name}
                </div>
                <div className="text-xs text-gray-600">
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
