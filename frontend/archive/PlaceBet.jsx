import { useState, useEffect } from "react";

export default function PlaceBet({ market, user, onBetPlaced, onBack }) {
  const [marketDetail, setMarketDetail] = useState(null);
  const [billSummary, setBillSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [position, setPosition] = useState("pass");
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMarketDetail();
    loadBillSummary();
  }, [market.market_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMarketDetail = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/markets/${market.market_id}`);
      const detail = await response.json();
      setMarketDetail(detail);
    } catch (err) {
      setError("Failed to load market details");
    } finally {
      setLoading(false);
    }
  };

  const loadBillSummary = async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/bill/${market.congress}/${market.bill_type}/${market.bill_number}/summaries`
      );
      if (response.ok) {
        const data = await response.json();
        const summaries = data.summaries || [];
        if (summaries.length > 0) {
          // Get the most recent summary
          const latest = summaries.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
          setBillSummary(latest);
        }
      }
    } catch (err) {
      console.error("Failed to load bill summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handlePlaceBet = async (e) => {
    e.preventDefault();
    
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      setError("Please enter a valid bet amount");
      return;
    }
    
    if (betAmount > user.balance) {
      setError("Insufficient balance");
      return;
    }

    setPlacing(true);
    setError(null);

    try {
      const response = await fetch("http://127.0.0.1:8000/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_id: market.market_id,
          user_id: user.user_id,
          position: position,
          amount: betAmount
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to place bet");
      }

      const result = await response.json();
      
      // Refresh market detail and user balance
      await Promise.all([
        loadMarketDetail(),
        onBetPlaced()
      ]);
      
      setAmount("");
      alert(`Bet placed successfully! Potential payout: $${result.potential_payout.toFixed(2)}`);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  const formatCurrency = (amount) => `$${amount.toFixed(2)}`;
  const formatOdds = (odds) => `${odds.toFixed(2)}x`;

  if (loading) {
    return <div style={{ padding: 20 }}>Loading market details...</div>;
  }

  if (!marketDetail) {
    return <div style={{ padding: 20, color: "red" }}>Failed to load market details</div>;
  }

  const currentOdds = marketDetail.odds[position] || 0;
  const potentialPayout = parseFloat(amount || 0) * currentOdds;
  const isValidAmount = !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Market Header */}
      <div style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 24,
        marginBottom: 24
      }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600 }}>
                {marketDetail.bill_type.toUpperCase()} {marketDetail.bill_number}
              </h2>
              <p style={{ margin: "0 0 12px 0", fontSize: 16, color: "#374151" }}>
                {marketDetail.title || "No title available"}
              </p>
            </div>
            <button
              onClick={() => {
                const billUrl = `/?congress=${marketDetail.congress}&billType=${marketDetail.bill_type}&billNumber=${marketDetail.bill_number}`;
                window.open(billUrl, '_blank');
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "white",
                color: "#374151",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500
              }}
            >
              📄 Full Bill Details
            </button>
          </div>
          
          {marketDetail.description && (
            <p style={{ margin: "0 0 12px 0", color: "#6b7280" }}>
              {marketDetail.description}
            </p>
          )}
          
          <div style={{ fontSize: 14, color: "#9ca3af" }}>
            Congress {marketDetail.congress} • 
            Total Volume: {formatCurrency(marketDetail.stats.total_volume)} • 
            {marketDetail.stats.total_bets} bets placed
            {marketDetail.deadline && (
              <span> • Deadline: {new Date(marketDetail.deadline).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Bill Summary Section */}
        {summaryLoading ? (
          <div style={{ 
            padding: 16, 
            background: "#f8fafc", 
            borderRadius: 8, 
            marginBottom: 16,
            fontSize: 14,
            color: "#6b7280"
          }}>
            Loading bill summary...
          </div>
        ) : billSummary ? (
          <div style={{ 
            padding: 16, 
            background: "#f8fafc", 
            borderRadius: 8, 
            marginBottom: 16,
            border: "1px solid #e2e8f0"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ 
                fontSize: 12, 
                fontWeight: 600, 
                background: "#eef2ff", 
                color: "#3730a3",
                padding: "2px 8px", 
                borderRadius: 4 
              }}>
                SUMMARY
              </span>
              <span style={{ 
                fontSize: 12, 
                background: "#f3f4f6", 
                padding: "2px 6px", 
                borderRadius: 4 
              }}>
                {billSummary.source || "CRS"}
              </span>
              {billSummary.date && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {billSummary.date}
                </span>
              )}
            </div>
            <div style={{ 
              fontSize: 14, 
              lineHeight: 1.5, 
              color: "#374151",
              maxHeight: 120,
              overflow: "auto"
            }}>
              {billSummary.text}
            </div>
          </div>
        ) : (
          <div style={{ 
            padding: 16, 
            background: "#fef9e7", 
            borderRadius: 8, 
            marginBottom: 16,
            border: "1px solid #fbbf24",
            fontSize: 14,
            color: "#92400e"
          }}>
            ⚠️ No bill summary available. Click "Full Bill Details" above for more information.
          </div>
        )}

        {/* Current Odds Display */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr", 
          gap: 16,
          padding: 16,
          background: "#f8fafc",
          borderRadius: 8
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 4 }}>PASS</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#10b981" }}>
              {formatOdds(marketDetail.odds.pass || 0)}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Volume: {formatCurrency(marketDetail.stats.pass_volume)}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 4 }}>FAIL</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#ef4444" }}>
              {formatOdds(marketDetail.odds.fail || 0)}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Volume: {formatCurrency(marketDetail.stats.fail_volume)}
            </div>
          </div>
        </div>
      </div>

      {/* Betting Form */}
      <div style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 24,
        marginBottom: 24
      }}>
        <h3 style={{ margin: "0 0 20px 0", fontSize: 20, fontWeight: 600 }}>Place Your Bet</h3>
        
        <form onSubmit={handlePlaceBet}>
          {/* Position Selection */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Your Prediction
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setPosition("pass")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: `2px solid ${position === "pass" ? "#10b981" : "#e5e7eb"}`,
                  borderRadius: 8,
                  background: position === "pass" ? "#ecfdf5" : "white",
                  color: position === "pass" ? "#10b981" : "#374151",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                PASS ({formatOdds(marketDetail.odds.pass || 0)})
              </button>
              <button
                type="button"
                onClick={() => setPosition("fail")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: `2px solid ${position === "fail" ? "#ef4444" : "#e5e7eb"}`,
                  borderRadius: 8,
                  background: position === "fail" ? "#fef2f2" : "white",
                  color: position === "fail" ? "#ef4444" : "#374151",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                FAIL ({formatOdds(marketDetail.odds.fail || 0)})
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Bet Amount
            </label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#6b7280",
                fontSize: 16
              }}>
                $
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                max={user.balance}
                step="0.01"
                placeholder="0.00"
                style={{
                  width: "100%",
                  padding: "12px 12px 12px 24px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  fontSize: 16
                }}
                required
              />
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Available balance: {formatCurrency(user.balance)}
            </div>
          </div>

          {/* Quick Amount Buttons */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[10, 25, 50, 100].map(quickAmount => (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(Math.min(quickAmount, user.balance).toString())}
                  disabled={quickAmount > user.balance}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    background: "white",
                    cursor: quickAmount > user.balance ? "not-allowed" : "pointer",
                    opacity: quickAmount > user.balance ? 0.5 : 1,
                    fontSize: 14
                  }}
                >
                  ${quickAmount}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount(user.balance.toString())}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  background: "white",
                  cursor: "pointer",
                  fontSize: 14
                }}
              >
                All In
              </button>
            </div>
          </div>

          {/* Payout Preview */}
          {isValidAmount && (
            <div style={{
              padding: 16,
              background: "#f8fafc",
              borderRadius: 8,
              marginBottom: 20
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Bet Amount:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(parseFloat(amount))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Odds:</span>
                <span style={{ fontWeight: 600 }}>{formatOdds(currentOdds)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 600 }}>
                <span>Potential Payout:</span>
                <span style={{ color: "#10b981" }}>{formatCurrency(potentialPayout)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280" }}>
                <span>Potential Profit:</span>
                <span>{formatCurrency(potentialPayout - parseFloat(amount))}</span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ 
              padding: 12, 
              background: "#fef2f2", 
              border: "1px solid #fecaca", 
              borderRadius: 6, 
              color: "#dc2626",
              marginBottom: 20
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={placing || !isValidAmount || parseFloat(amount) > user.balance}
            style={{
              width: "100%",
              padding: "16px",
              background: (placing || !isValidAmount || parseFloat(amount) > user.balance) ? "#e5e7eb" : "#2563eb",
              color: (placing || !isValidAmount || parseFloat(amount) > user.balance) ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: (placing || !isValidAmount || parseFloat(amount) > user.balance) ? "not-allowed" : "pointer"
            }}
          >
            {placing ? "Placing Bet..." : `Place Bet: ${position.toUpperCase()}`}
          </button>
        </form>
      </div>

      {/* Recent Bets */}
      {marketDetail.recent_bets && marketDetail.recent_bets.length > 0 && (
        <div style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 24
        }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>Recent Bets</h3>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {marketDetail.recent_bets.map(bet => (
              <div 
                key={bet.bet_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #f3f4f6"
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{bet.username}</span>
                  <span style={{ 
                    marginLeft: 8,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 12,
                    background: bet.position === "pass" ? "#ecfdf5" : "#fef2f2",
                    color: bet.position === "pass" ? "#10b981" : "#ef4444"
                  }}>
                    {bet.position.toUpperCase()}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 600 }}>{formatCurrency(bet.amount)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    @ {formatOdds(bet.odds)} • {new Date(bet.placed_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}