import { useEffect, useState } from "react";
import { PoliticalTermTooltip, OddsExplainer } from "../src/EducationalTooltip";

export default function BettingMarkets({ onSelectMarket }) {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    loadMarkets();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMarkets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/markets?status=${filter}&limit=50`);
      if (!response.ok) throw new Error("Failed to load markets");
      
      const data = await response.json();
      setMarkets(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Removed unused helper functions - they're defined in MarketCard component instead

  if (loading) {
    return <div style={{ padding: 20 }}>Loading markets...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        Error loading markets: {error}
        <button onClick={loadMarkets} style={{ marginLeft: 10 }}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>Filter:</span>
        {["active", "resolved", "all"].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: filter === status ? "#2563eb" : "white",
              color: filter === status ? "white" : "#374151",
              cursor: "pointer",
              textTransform: "capitalize"
            }}
          >
            {status}
          </button>
        ))}
        
        <button
          onClick={loadMarkets}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "white",
            cursor: "pointer"
          }}
        >
          Refresh
        </button>
      </div>

      {markets.length === 0 ? (
        <div style={{ 
          padding: 40, 
          textAlign: "center", 
          color: "#6b7280",
          border: "1px dashed #e5e7eb",
          borderRadius: 8
        }}>
          No {filter !== "all" ? filter : ""} markets found
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {markets.map(market => (
            <MarketCard 
              key={market.market_id} 
              market={market} 
              onSelect={onSelectMarket}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketCard({ market, onSelect }) {
  const getOddsForPosition = (market, isFirst) => {
    const positions = Object.keys(market.odds || {});
    if (positions.length < 2) return 0;
    
    // Map first/second position based on market type
    const firstPos = positions[0];
    const secondPos = positions[1];
    
    return isFirst ? (market.odds[firstPos] || 0) : (market.odds[secondPos] || 0);
  };

  const firstOdds = getOddsForPosition(market, true);
  const secondOdds = getOddsForPosition(market, false);
  
  const formatOdds = (odds) => odds ? `${odds.toFixed(2)}x` : "—";
  const formatCurrency = (amount) => `$${amount.toFixed(2)}`;
  
  const getStatusColor = (status) => {
    switch (status) {
      case "active": return "#10b981";
      case "resolved": return "#6b7280";
      case "cancelled": return "#ef4444";
      default: return "#6b7280";
    }
  };

  const isActive = market.status === "active";
  const isPastDeadline = market.deadline && new Date(market.deadline) < new Date();

  const handleViewBill = () => {
    const billUrl = `/?congress=${market.congress}&billType=${market.bill_type}&billNumber=${market.bill_number}`;
    window.open(billUrl, '_blank');
  };

  const getMarketTitle = (market) => {
    switch (market.market_type) {
      case "bill_passage":
        return market.title || "Will this bill pass?";
      case "member_vote":
        return `Will ${market.target_member_name || market.target_member} vote YES?`;
      case "vote_count":
        return `Will there be over ${market.target_count} YES votes?`;
      case "timeline":
        return `Will this be voted on before ${new Date(market.target_date).toLocaleDateString()}?`;
      default:
        return market.title || "No title available";
    }
  };

  const getPositionLabel = (market, isFirst) => {
    switch (market.market_type) {
      case "bill_passage":
        return isFirst ? "PASS" : "FAIL";
      case "member_vote":
        return isFirst ? "YES" : "NO";
      case "vote_count":
        return isFirst ? "OVER" : "UNDER";
      case "timeline":
        return isFirst ? "BEFORE" : "AFTER";
      default:
        return isFirst ? "YES" : "NO";
    }
  };

  return (
    <div style={{
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 20,
      background: "white",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ 
              fontSize: 12, 
              fontWeight: 600, 
              color: getStatusColor(market.status),
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              {market.status}
            </span>
            {market.resolution && (
              <span style={{ 
                fontSize: 12, 
                background: "#f3f4f6", 
                padding: "2px 6px", 
                borderRadius: 4,
                textTransform: "capitalize"
              }}>
                {market.resolution}
              </span>
            )}
          </div>
          
          <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 600 }}>
            {market.bill_type.toUpperCase()} {market.bill_number}
          </h3>
          
          <PoliticalTermTooltip term={market.market_type}>
            <p style={{ margin: "0 0 8px 0", color: "#374151", lineHeight: 1.4, cursor: "help" }}>
              {getMarketTitle(market)}
            </p>
          </PoliticalTermTooltip>
          
          {market.description && (
            <p style={{ margin: "0 0 8px 0", color: "#6b7280", fontSize: 14 }}>
              {market.description}
            </p>
          )}
          
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Congress {market.congress} • Volume: {formatCurrency(market.volume)}
            {market.deadline && (
              <span> • Deadline: {new Date(market.deadline).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 12, alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
            {getPositionLabel(market, true)}
          </div>
          <OddsExplainer odds={firstOdds} marketType={market.market_type}>
            <div style={{ 
              fontSize: 18, 
              fontWeight: 600, 
              color: firstOdds < secondOdds ? "#10b981" : "#374151",
              cursor: "help"
            }}>
              {formatOdds(firstOdds)}
            </div>
          </OddsExplainer>
        </div>
        
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
            {getPositionLabel(market, false)}
          </div>
          <OddsExplainer odds={secondOdds} marketType={market.market_type}>
            <div style={{ 
              fontSize: 18, 
              fontWeight: 600, 
              color: secondOdds < firstOdds ? "#10b981" : "#374151",
              cursor: "help"
            }}>
              {formatOdds(secondOdds)}
            </div>
          </OddsExplainer>
        </div>
        
        <div>
          <button
            onClick={handleViewBill}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500
            }}
            title="View full bill details and summary"
          >
            📄 Bill Info
          </button>
        </div>
        
        <div>
          <button
            onClick={() => onSelect(market)}
            disabled={!isActive || isPastDeadline}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: (!isActive || isPastDeadline) ? "#e5e7eb" : "#2563eb",
              color: (!isActive || isPastDeadline) ? "#9ca3af" : "white",
              cursor: (!isActive || isPastDeadline) ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14
            }}
          >
            {!isActive ? "Closed" : isPastDeadline ? "Expired" : "Bet"}
          </button>
        </div>
      </div>
    </div>
  );
}