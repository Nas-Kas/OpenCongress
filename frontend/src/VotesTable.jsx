import { useMemo, useState } from "react";

function VoteChip({ pos }) {
  const p = pos || "—";
  const getVoteClasses = (vote) => {
    const baseClasses = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold";
    switch (vote) {
      case "Yea":
        return `${baseClasses} bg-vote-yea-bg text-vote-yea-fg`;
      case "Nay":
        return `${baseClasses} bg-vote-nay-bg text-vote-nay-fg`;
      case "Present":
        return `${baseClasses} bg-vote-present-bg text-vote-present-fg`;
      case "Not Voting":
        return `${baseClasses} bg-vote-nv-bg text-vote-nv-fg`;
      default:
        return `${baseClasses} bg-vote-present-bg text-vote-present-fg`;
    }
  };

  return (
    <span
      aria-label={`Vote: ${p}`}
      title={`Vote: ${p}`}
      className={getVoteClasses(p)}
    >
      {p}
    </span>
  );
}

export default function VotesTable({ rows = [], onOpenMember }) {
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedRows.slice(startIndex, endIndex);
  }, [sortedRows, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedRows.length / itemsPerPage);

  const setSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const sortIndicator = (key) =>
    sortKey !== key ? "↕" : sortDir === "asc" ? "▲" : "▼";

  const ariaSort = (key) =>
    sortKey !== key ? "none" : sortDir === "asc" ? "ascending" : "descending";

  const handleOpenMember = (bioguideId) => {
    console.log("Opening member:", bioguideId); // Debug log
    if (typeof onOpenMember === "function" && bioguideId) {
      onOpenMember(bioguideId);
    }
  };

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-300 bg-blue-50 text-sm text-gray-600">
        <span>
          Showing <strong>{paginatedRows.length}</strong> of <strong>{rows.length}</strong> members
          {totalPages > 1 && <> • Page {currentPage} of {totalPages}</>}
        </span>
        <div className="flex items-center gap-2">
          <label className="text-xs">Per page:</label>
          <select 
            value={itemsPerPage} 
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th aria-sort={ariaSort("name")} className="text-left font-bold text-xs text-gray-800 px-3 py-2.5 border-b border-gray-300 bg-gray-50 sticky top-0 z-10">
                <button
                  className="bg-transparent border-0 p-0 m-0 cursor-pointer font-inherit inline-flex items-center gap-1.5"
                  onClick={() => setSort("name")}
                  title="Sort by Member"
                >
                  Member <span>{sortIndicator("name")}</span>
                </button>
              </th>
              <th aria-sort={ariaSort("party")} className="text-left font-bold text-xs text-gray-800 px-3 py-2.5 border-b border-gray-300 bg-gray-50 sticky top-0 z-10">
                <button
                  className="bg-transparent border-0 p-0 m-0 cursor-pointer font-inherit inline-flex items-center gap-1.5"
                  onClick={() => setSort("party")}
                  title="Sort by Party"
                >
                  Party <span>{sortIndicator("party")}</span>
                </button>
              </th>
              <th aria-sort={ariaSort("state")} className="text-left font-bold text-xs text-gray-800 px-3 py-2.5 border-b border-gray-300 bg-gray-50 sticky top-0 z-10">
                <button
                  className="bg-transparent border-0 p-0 m-0 cursor-pointer font-inherit inline-flex items-center gap-1.5"
                  onClick={() => setSort("state")}
                  title="Sort by State"
                >
                  State <span>{sortIndicator("state")}</span>
                </button>
              </th>
              <th aria-sort={ariaSort("position")} className="text-left font-bold text-xs text-gray-800 px-3 py-2.5 border-b border-gray-300 bg-gray-50 sticky top-0 z-10">
                <button
                  className="bg-transparent border-0 p-0 m-0 cursor-pointer font-inherit inline-flex items-center gap-1.5"
                  onClick={() => setSort("position")}
                  title="Sort by Vote"
                >
                  Vote <span>{sortIndicator("position")}</span>
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedRows.map((m, idx) => (
              <tr key={m.bioguideId ?? idx} className="border-t border-gray-300 odd:bg-blue-50 hover:bg-blue-100">
                <td className="px-3 py-2.5 text-gray-900 text-sm min-w-[220px]">
                  <button
                    type="button"
                    onClick={() => handleOpenMember(m.bioguideId)}
                    className="bg-none border-none text-blue-600 underline cursor-pointer p-0 font-inherit hover:text-blue-800"
                    aria-label={`Open profile for ${m.name}`}
                  >
                    {m.name}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-gray-900 text-sm">{m.party}</td>
                <td className="px-3 py-2.5 text-gray-900 text-sm">{m.state}</td>
                <td className="px-3 py-2.5 text-gray-900 text-sm">
                  <VoteChip pos={m.position} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 p-4 border-t border-gray-300 bg-gray-50">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${
              currentPage === 1 
                ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            ← Previous
          </button>
          
          <div className="flex items-center gap-2">
            {/* Show page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    currentPage === pageNum
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${
              currentPage === totalPages 
                ? "bg-gray-50 text-gray-400 cursor-not-allowed" 
                : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
