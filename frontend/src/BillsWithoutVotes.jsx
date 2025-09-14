import { useEffect, useState } from "react";
import EducationalTooltip from "./EducationalTooltip";

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

  const formatDate = (dateStr) => {
    if (!dateStr) return "Unknown";
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getLatestActionText = (latestAction) => {
    if (!latestAction) return "No recent action";
    
    if (typeof latestAction === 'string') {
      return latestAction;
    }
    
    if (typeof latestAction === 'object' && latestAction.text) {
      return latestAction.text;
    }
    
    return "No recent action";
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
    return (
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        padding: 40,
        gap: 12 
      }}>
        <div style={{
          width: 20,
          height: 20,
          border: "2px solid #e5e7eb",
          borderTop: "2px solid #2563eb",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <span>Loading bills without votes...</span>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 20,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 8,
        color: "#dc2626"
      }}>
        <strong>Error loading bills:</strong> {error}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ 
          margin: "0 0 8px 0", 
          fontSize: "clamp(20px, 4vw, 28px)",
          color: "#1f2937"
        }}>
          📋 Early-Stage Bills
        </h1>
        <p style={{ 
          margin: 0, 
          color: "#6b7280", 
          fontSize: 16,
          lineHeight: 1.5 
        }}>
          Bills that haven't had House votes yet 
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
        alignItems: "end"
      }}>
        <div>
          <label style={{ 
            display: "block", 
            fontSize: 12, 
            fontWeight: 600, 
            color: "#374151", 
            marginBottom: 4 
          }}>
            CONGRESS
          </label>
          <select
            value={congress}
            onChange={(e) => setCongress(parseInt(e.target.value))}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value={119}>119th Congress (2025-2026)</option>
            <option value={118}>118th Congress (2023-2024)</option>
          </select>
        </div>

        <div>
          <label style={{ 
            display: "block", 
            fontSize: 12, 
            fontWeight: 600, 
            color: "#374151", 
            marginBottom: 4 
          }}>
            BILL TYPE
          </label>
          <select
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14
            }}
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <EducationalTooltip
            title="🎯 Early-Stage Betting"
            content="These bills haven't been voted on yet, making them perfect for betting on committee outcomes, sponsor counts, or whether they'll even get a vote!"
          >
            <div style={{
              padding: "6px 12px",
              background: "#dbeafe",
              color: "#1e40af",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "help",
              borderBottom: "1px dotted #1e40af"
            }}>
              💡 Betting Opportunities
            </div>
          </EducationalTooltip>
        </div>
      </div>

      {/* Results Summary */}
      <div style={{ 
        marginBottom: 16, 
        fontSize: 14, 
        color: "#6b7280",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8
      }}>
        <span>
          Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} bills
        </span>
        {loading && (
          <span style={{ color: "#2563eb" }}>Loading...</span>
        )}
      </div>

      {/* Bills List */}
      {bills.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: "center",
          background: "#f8fafc",
          border: "1px dashed #cbd5e1",
          borderRadius: 8,
          color: "#6b7280"
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
          <p style={{ margin: 0 }}>
            No bills without votes found for the selected filters.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {bills.map((bill) => (
            <div
              key={`${bill.congress}-${bill.billType}-${bill.billNumber}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 20,
                background: "white",
                transition: "all 0.2s",
                cursor: "pointer"
              }}
              onClick={() => navigateToBill(bill)}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.1)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      background: "#2563eb",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {bill.billType.toUpperCase()} {bill.billNumber}
                    </span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      Introduced: {formatDate(bill.introducedDate)}
                    </span>
                  </div>
                  
                  <h3 style={{ 
                    margin: "0 0 12px 0", 
                    fontSize: 18, 
                    lineHeight: 1.4,
                    color: "#1f2937"
                  }}>
                    {bill.title || `${bill.billType.toUpperCase()} ${bill.billNumber}`}
                  </h3>
                  
                  <div style={{ 
                    fontSize: 14, 
                    color: "#6b7280",
                    lineHeight: 1.4
                  }}>
                    <strong>Latest Action:</strong> {getLatestActionText(bill.latestAction)}
                  </div>
                </div>
                
                <div style={{
                  background: "#f0fdf4",
                  color: "#166534",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  marginLeft: 16
                }}>
                  🎯 No Votes Yet
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          marginTop: 24,
          padding: 16
        }}>
          <button
            onClick={handlePrevPage}
            disabled={pagination.offset === 0}
            style={{
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              background: pagination.offset === 0 ? "#f9fafb" : "white",
              color: pagination.offset === 0 ? "#9ca3af" : "#374151",
              borderRadius: 6,
              cursor: pagination.offset === 0 ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500
            }}
          >
            ← Previous
          </button>
          
          <span style={{ fontSize: 14, color: "#6b7280" }}>
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={!pagination.hasMore}
            style={{
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              background: !pagination.hasMore ? "#f9fafb" : "white",
              color: !pagination.hasMore ? "#9ca3af" : "#374151",
              borderRadius: 6,
              cursor: !pagination.hasMore ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}