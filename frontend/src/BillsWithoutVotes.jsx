import { useEffect, useState, useMemo } from "react";
import { LoadingSpinner, ErrorMessage, BillCard, InlineSpinner } from "./components";
import { useDebouncedValue } from "./hooks/useDebouncedValue";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function BillsWithoutVotes({ onSelectBill }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [congress, setCongress] = useState(119);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [billType, setBillType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Load bills from API with server-side search and filtering
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    // Don't clear bills - keep showing old results while fetching

    const params = new URLSearchParams({
      congress: congress.toString(),
      limit: "200",
      offset: "0"
    });

    // Add server-side filters (use debounced search value)
    if (debouncedSearch.trim()) {
      params.set('search', debouncedSearch.trim());
    }
    if (billType !== "all") {
      params.set('bill_type', billType.toLowerCase());
    }

    fetch(`${API_URL}/bills/no-votes?${params}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => setBills(data.bills || []))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [congress, debouncedSearch, billType]); // Use debounced value to prevent excessive API calls

  // Get unique bill types from loaded bills
  const uniqueTypes = useMemo(() => {
    const types = new Set();
    for (const b of bills) {
      if (b.billType) types.add(b.billType.toUpperCase());
    }
    return Array.from(types).sort();
  }, [bills]);

  // Client-side filtering for date filters only (search and bill type are server-side)
  const filtered = useMemo(() => {
    let list = bills;

    // Note: Search and bill type filtering are now handled server-side
    
    // Date filters (still client-side for now)
    if (fromDate) {
      list = list.filter((b) => (b.introducedDate || "") >= fromDate);
    }
    if (toDate) {
      list = list.filter((b) => (b.introducedDate || "") <= toDate);
    }

    // Server already sorts appropriately, maintain that order
    return list;
  }, [bills, fromDate, toDate]); // Removed searchQuery and billType from dependencies

  // Pagination
  const paginatedBills = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, billType, fromDate, toDate, congress]);

  const navigateToBill = (bill) => {
    if (onSelectBill) {
      onSelectBill({
        congress: bill.congress,
        billType: bill.billType,
        billNumber: bill.billNumber
      });
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setBillType("all");
    setFromDate("");
    setToDate("");
  };

  const hasActiveFilters = searchQuery || billType !== "all" || fromDate || toDate;

  // Only show full loading screen if we have no data yet
  if (loading && bills.length === 0) {
    return <LoadingSpinner message="Loading bills without votes..." />;
  }

  if (error) {
    return <ErrorMessage message={error} title="Error loading bills:" />;
  }

  return (
    <div className="px-5 py-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="m-0 mb-2 text-xl sm:text-2xl font-bold">📋 Early-Stage Bills</h1>
        <p className="m-0 text-gray-500 text-xs sm:text-sm leading-relaxed">
          Bills that haven't had House votes yet
        </p>
      </div>

      {/* Filters - matching House Roll-Call Votes layout */}
      <div className="bg-gray-50 p-2 rounded-lg mb-4">
        {/* Main filter row */}
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by bill number or title..."
              className="w-full px-3 py-2.5 pr-9 rounded-lg border border-gray-300 bg-white text-sm"
            />
            {loading && (
              <InlineSpinner className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>

          <select
            value={congress}
            onChange={(e) => setCongress(parseInt(e.target.value))}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[130px]"
          >
            <option value={119}>119th Congress</option>
            <option value={118}>118th Congress</option>
          </select>

          <select
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[120px]"
          >
            <option value="all">All types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            placeholder="From date"
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
          />

          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            placeholder="To date"
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
          />

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-2.5 cursor-pointer text-sm hover:bg-gray-50"
              title="Clear all filters"
            >
              Reset
            </button>
          )}
        </div>

        {/* Summary line */}
        <div className="flex justify-between items-center mx-0.5 my-1.5 text-xs text-gray-500">
          <span>
            Showing <strong>{filtered.length}</strong> bills
            {filtered.length > itemsPerPage && (
              <> • Page {currentPage} of {totalPages}</>
            )}
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
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bills List */}
      {paginatedBills.length === 0 ? (
        <div className="p-10 text-center bg-gray-50 border border-dashed border-gray-400 rounded-lg text-gray-500">
          <div className="text-2xl mb-2">📭</div>
          <p className="m-0">
            {hasActiveFilters
              ? "No bills match your filters."
              : "No bills without votes found."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {paginatedBills.map((bill) => (
            <BillCard
              key={`${bill.congress}-${bill.billType}-${bill.billNumber}`}
              bill={bill}
              badge="🎯 No Votes Yet"
              onClick={() => navigateToBill(bill)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${
              currentPage === 1
                ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            ← Previous
          </button>

          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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