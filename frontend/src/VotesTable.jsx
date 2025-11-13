import { useMemo, useState } from "react";

function VoteChip({ pos }) {
  const p = pos || "—";
  const classMap = {
    Yea: "badge-yea",
    Nay: "badge-nay",
    Present: "badge-present",
    "Not Voting": "badge-nv",
    "—": "badge-present",
  };

  return (
    <span
      aria-label={`Vote: ${p}`}
      title={`Vote: ${p}`}
      className={`vote-chip ${classMap[p]}`}
    >
      {p}
    </span>
  );
}

export default function VotesTable({ rows = [], onOpenMember }) {
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const sortedRows = useMemo(() => {
    const keyed = rows.map((r, i) => ({ r, i }));
    const cmp = (a, b) => {
      const va = a.r[sortKey] ?? "";
      const vb = b.r[sortKey] ?? "";
      let diff = 0;

      if (sortKey === "position") {
        const VOTE_RANK = { Yea: 3, Nay: 2, Present: 1, "Not Voting": 0 };
        const ra = VOTE_RANK[va] ?? -1;
        const rb = VOTE_RANK[vb] ?? -1;
        diff = ra - rb;
      } else {
        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        diff = sa < sb ? -1 : sa > sb ? 1 : 0;
      }

      if (diff === 0) return a.i - b.i;
      return sortDir === "asc" ? diff : -diff;
    };
    return keyed.sort(cmp).map((k) => k.r);
  }, [rows, sortKey, sortDir]);

  const setSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key) =>
    sortKey !== key ? "↕" : sortDir === "asc" ? "▲" : "▼";

  const ariaSort = (key) =>
    sortKey !== key ? "none" : sortDir === "asc" ? "ascending" : "descending";

  const handleOpenMember = (bioguideId) => {
    if (typeof onOpenMember === "function" && bioguideId) {
      onOpenMember(bioguideId);
    }
  };

  return (
    <div className="votes-card">
      <div className="votes-header">
        Showing <strong>{rows.length}</strong> members
      </div>

      <div className="votes-table-wrap">
        <table className="votes-table">
          <thead>
            <tr>
              <th aria-sort={ariaSort("name")} className="votes-th">
                <button
                  className="votes-sort-btn"
                  onClick={() => setSort("name")}
                  title="Sort by Member"
                >
                  Member <span>{sortIndicator("name")}</span>
                </button>
              </th>
              <th aria-sort={ariaSort("party")} className="votes-th">
                <button
                  className="votes-sort-btn"
                  onClick={() => setSort("party")}
                  title="Sort by Party"
                >
                  Party <span>{sortIndicator("party")}</span>
                </button>
              </th>
              <th aria-sort={ariaSort("state")} className="votes-th">
                <button
                  className="votes-sort-btn"
                  onClick={() => setSort("state")}
                  title="Sort by State"
                >
                  State <span>{sortIndicator("state")}</span>
                </button>
              </th>
              <th aria-sort={ariaSort("position")} className="votes-th">
                <button
                  className="votes-sort-btn"
                  onClick={() => setSort("position")}
                  title="Sort by Vote"
                >
                  Vote <span>{sortIndicator("position")}</span>
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((m, idx) => (
              <tr key={m.bioguideId ?? idx} className="votes-row">
                <td className="votes-td name-cell">
                  <button
                    type="button"
                    onClick={() => handleOpenMember(m.bioguideId)}
                    className="link-button"
                    aria-label={`Open profile for ${m.name}`}
                  >
                    {m.name}
                  </button>
                </td>
                <td className="votes-td">{m.party}</td>
                <td className="votes-td">{m.state}</td>
                <td className="votes-td">
                  <VoteChip pos={m.position} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
