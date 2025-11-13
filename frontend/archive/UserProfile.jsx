import { useState, useEffect } from "react";

export default function UserProfile({ user, onRefresh }) {
  const [showBets, setShowBets] = useState(false);
  const [userBets, setUserBets] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUserBets = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/users/${user.user_id}/bets?limit=20`);
      const bets = await response.json();
      setUserBets(bets);
    } catch (error) {
      console.error("Failed to load user bets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showBets && userBets.length === 0) {
      loadUserBets();
    }
  }, [showBets]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (amount) => `$${amount.toFixed(2)}`;

  const getStatusColor = (status) => {
    switch (status) {
      case "won": return "#10b981";
      case "lost": return "#ef4444";
      case "active": return "#2563eb";
      case "refunded": return "#f59e0b";
      default: return "#6b7280";
    }
  };

  const totalWinnings = userBets
    .filter(bet => bet.status === "won")
    .reduce((sum, bet) => sum + bet.potential_payout, 0);

  const totalLosses = userBets
    .filter(bet => bet.status === "lost")
    .reduce((sum, bet) => sum + bet.amount, 0);

  const activeBets = userBets.filter(bet => bet.status === "active").length;

  return (
    <div style={{ position: "relative" }}>
      <div 
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          background: "#f8fafc",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          cursor: "pointer"
        }}
        onClick={() => setShowBets(!showBets)}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user.username}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Balance: {formatCurrency(user.balance)}
          </div>
        </div>
        <div style={{ 
          fontSize: 12, 
          transform: showBets ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s"
        }}>
          ▼
        </div>
      </div>

      {showBets && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 8,
          width: 400,
          maxHeight: 500,
          overflow: "auto",
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          zIndex: 50
        }}>
          <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Betting History</h3>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                  loadUserBets();
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  border: "1px solid #e2e8f0",
                  borderRadius: 4,
                  background: "white",
                  cursor: "pointer"
                }}
              >
                Refresh
              </button>
            </div>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr 1fr", 
              gap: 8, 
              marginTop: 12,
              fontSize: 12
            }}>
              <div>
                <div style={{ color: "#64748b" }}>Active Bets</div>
                <div style={{ fontWeight: 600 }}>{activeBets}</div>
              </div>
              <div>
                <div style={{ color: "#64748b" }}>Total Won</div>
                <div style={{ fontWeight: 600, color: "#10b981" }}>
                  {formatCurrency(totalWinnings)}
                </div>
              </div>
              <div>
                <div style={{ color: "#64748b" }}>Total Lost</div>
                <div style={{ fontWeight: 600, color: "#ef4444" }}>
                  {formatCurrency(totalLosses)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                Loading bets...
              </div>
            ) : userBets.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                No bets placed yet
              </div>
            ) : (
              userBets.map(bet => (
                <div 
                  key={bet.bet_id}
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f1f5f9"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                        {bet.market.bill_type.toUpperCase()} {bet.market.bill_number}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                        {bet.market.title || "No title"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {new Date(bet.placed_at).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: getStatusColor(bet.status),
                        textTransform: "uppercase",
                        marginBottom: 2
                      }}>
                        {bet.status}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {bet.position.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {formatCurrency(bet.amount)} @ {bet.odds?.toFixed(2)}x
                      </div>
                      {bet.status === "won" && (
                        <div style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>
                          Won {formatCurrency(bet.potential_payout)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}