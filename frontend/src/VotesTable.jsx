import { useMemo, useState } from "react";

const VOTE_RANK = { Yea: 3, Nay: 2, Present: 1, "Not Voting": 0 };

export default function VotesTable({ rows = [], onOpenMember }) {
  const [sortKey, setSortKey] = useState("name"); // "name" | "party" | "state" | "position"
  const [sortDir, setSortDir] = useState("asc");  // "asc" | "desc"

  const sortedRows = useMemo(() => {
    const keyed = rows.map((r, i) => ({ r, i }));
    const cmp = (a, b) => {
      const va = a.r[sortKey] ?? "";
      const vb = b.r[sortKey] ?? "";
      let diff = 0;

      if (sortKey === "position") {
        const ra = VOTE_RANK[va] ?? -1;
        const rb = VOTE_RANK[vb] ?? -1;
        diff = ra - rb;
      } else {
        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        diff = sa < sb ? -1 : sa > sb ? 1 : 0;
      }

      if (diff === 0) return a.i - b.i;             // stable
      return sortDir === "asc" ? diff : -diff;      // direction
    };
    return keyed.sort(cmp).map(k => k.r);
  }, [rows, sortKey, sortDir]);

  const setSort = (key) => {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortIndicator = (key) => (sortKey !== key ? "↕" : sortDir === "asc" ? "▲" : "▼");
  const ariaSort = (key) => (sortKey !== key ? "none" : sortDir === "asc" ? "ascending" : "descending");

  const headerButtonStyle = {
    background: "transparent",
    border: 0,
    padding: 0,
    margin: 0,
    cursor: "pointer",
    font: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  const badge = (pos) => {
    if (!pos) pos = "—";
    const mapColor = {
      Yea: "#d1fae5",
      Nay: "#fee2e2",
      Present: "#e5e7eb",
      "Not Voting": "#fef3c7",
      "—": "#e5e7eb"
    };
    return (
      <span
        aria-label={`Vote: ${pos}`}
        title={`Vote: ${pos}`}
        style={{
          padding: "2px 8px",
          background: mapColor[pos] ?? "#e5e7eb",
          borderRadius: 999,
          display: "inline-block",
          fontSize: 12,
          fontWeight: 600
        }}
      >
        {pos}
      </span>
    );
  };

  const handleOpenMember = (bioguideId) => {
    if (typeof onOpenMember === "function" && bioguideId) {
      onOpenMember(bioguideId);
    }
  };

  return (
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
          <tr style={{ color: "#111" }}>
            <th scope="col" align="left" aria-sort={ariaSort("name")} style={{ fontWeight: 700 }}>
              <button style={headerButtonStyle} onClick={() => setSort("name")} title="Sort by Member">
                Member <span aria-hidden>{sortIndicator("name")}</span>
              </button>
            </th>
            <th scope="col" align="left" aria-sort={ariaSort("party")} style={{ fontWeight: 700 }}>
              <button style={headerButtonStyle} onClick={() => setSort("party")} title="Sort by Party">
                Party <span aria-hidden>{sortIndicator("party")}</span>
              </button>
            </th>
            <th scope="col" align="left" aria-sort={ariaSort("state")} style={{ fontWeight: 700 }}>
              <button style={headerButtonStyle} onClick={() => setSort("state")} title="Sort by State">
                State <span aria-hidden>{sortIndicator("state")}</span>
              </button>
            </th>
            <th scope="col" align="left" aria-sort={ariaSort("position")} style={{ fontWeight: 700 }}>
              <button style={headerButtonStyle} onClick={() => setSort("position")} title="Sort by Vote">
                Vote <span aria-hidden>{sortIndicator("position")}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((m) => (
            <tr key={m.bioguideId ?? `${m.name}-${m.state}-${m.party}`} style={{ borderTop: "1px solid #f1f5f9" }}>
              <td>
                <button
                  type="button"
                  onClick={() => handleOpenMember(m.bioguideId)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    color: "#1d4ed8",
                    textDecoration: "underline",
                    cursor: "pointer",
                    font: "inherit"
                  }}
                  aria-label={`Open profile for ${m.name}`}
                >
                  {m.name}
                </button>
              </td>
              <td>{m.party}</td>
              <td>{m.state}</td>
              <td>{badge(m.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
