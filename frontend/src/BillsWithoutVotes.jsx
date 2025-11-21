import { useEffect, useState } from "react";
import EducationalTooltip from "./EducationalTooltip";
import { LoadingSpinner, ErrorMessage, BillCard } from "./components";

export default function BillsWithoutVotes() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [congress, setCongress] = useState(119);
  const [billType, setBillType] = useState("");
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0, hasMore: false });

  const loadBills = async (newOffset = 0) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        congress: congress.toString(),
        limit: pagination.limit.toString(),
        offset: newOffset.toString()
      });

      if (billType) {
        params.append("bill_type", billType);
      }

      const response = await fetch(`http://127.0.0.1:8000/bills/no-votes?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch bills: ${response.statusText}`);
      }

      const data = await response.json();
      setBills(data.bills);
      setPagination({
        total: data.total,
        limit: data.limit,
        offset: data.offset,
        hasMore: data.hasMore
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, [congress, billType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevPage = () => {
    const newOffset = Math.max(0, pagination.offset - pagination.limit);
    loadBills(newOffset);
  };

  const handleNextPage = () => {
    const newOffset = pagination.offset + pagination.limit;
    loadBills(newOffset);
  };

  const navigateToBill = (bill) => {
    const url = new URL(window.location);
    url.searchParams.set('congress', bill.congress);
    url.searchParams.set('billType', bill.billType);
    url.searchParams.set('billNumber', bill.billNumber);
    // Remove bills page params to switch to bill view
    url.searchParams.delete('bills');
    url.searchParams.delete('page');
    window.location.href = url.toString();
  };

  if (loading && bills.length === 0) {
    return <LoadingSpinner message="Loading bills without votes..." />;
  }

  if (error) {
    return <ErrorMessage message={error} title="Error loading bills:" />;
  }

  return (
    <div className="px-5 py-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="m-0 mb-2 text-2xl lg:text-3xl text-gray-800">
          📋 Early-Stage Bills
        </h1>
        <p className="m-0 text-gray-500 text-base leading-relaxed">
          Bills that haven't had House votes yet
        </p>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            CONGRESS
          </label>
          <select
            value={congress}
            onChange={(e) => setCongress(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value={119}>119th Congress (2025-2026)</option>
            <option value={118}>118th Congress (2023-2024)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            BILL TYPE
          </label>
          <select
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Types</option>
            <option value="hr">House Bills (HR)</option>
            <option value="s">Senate Bills (S)</option>
            <option value="hjres">House Joint Resolutions (HJRES)</option>
            <option value="sjres">Senate Joint Resolutions (SJRES)</option>
            <option value="hres">House Resolutions (HRES)</option>
            <option value="sres">Senate Resolutions (SRES)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <EducationalTooltip
            title="🎯 Early-Stage Betting"
            content="These bills haven't been voted on yet, making them perfect for betting on committee outcomes, sponsor counts, or whether they'll even get a vote!"
          >
            <div className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold cursor-help border-b border-dotted border-blue-700">
              💡 Betting Opportunities
            </div>
          </EducationalTooltip>
        </div>
      </div>

      {/* Results Summary */}
      <div className="mb-4 text-sm text-gray-500 flex justify-between items-center flex-wrap gap-2">
        <span>
          Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} bills
        </span>
        {loading && (
          <span className="text-blue-600">Loading...</span>
        )}
      </div>

      {/* Bills List */}
      {bills.length === 0 ? (
        <div className="p-10 text-center bg-gray-50 border border-dashed border-gray-400 rounded-lg text-gray-500">
          <div className="text-2xl mb-2">📭</div>
          <p className="m-0">
            No bills without votes found for the selected filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {bills.map((bill) => (
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
      {pagination.total > pagination.limit && (
        <div className="flex justify-center items-center gap-4 mt-6 p-4">
          <button
            onClick={handlePrevPage}
            disabled={pagination.offset === 0}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${pagination.offset === 0
              ? "bg-gray-50 text-gray-400 cursor-not-allowed"
              : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
              }`}
          >
            ← Previous
          </button>

          <span className="text-sm text-gray-500">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!pagination.hasMore}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${!pagination.hasMore
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