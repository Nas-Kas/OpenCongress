import { useEffect, useState } from "react";
import BettingMarkets from "./BettingMarkets";
import UserProfile from "./UserProfile";
import PlaceBet from "./PlaceBet";
import CreateAdvancedMarket from "./CreateAdvancedMarket";

export default function BettingPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);

  // Load user from localStorage or show create form
  useEffect(() => {
    const savedUserId = localStorage.getItem("betting_user_id");
    if (savedUserId) {
      fetch(`http://127.0.0.1:8000/users/${savedUserId}`)
        .then(r => r.ok ? r.json() : null)
        .then(user => {
          if (user) setCurrentUser(user);
          else setShowCreateUser(true);
        })
        .catch(() => setShowCreateUser(true));
    } else {
      setShowCreateUser(true);
    }
  }, []);

  const handleCreateUser = async (username, email) => {
    try {
      const response = await fetch("http://127.0.0.1:8000/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create user");
      }
      
      const user = await response.json();
      localStorage.setItem("betting_user_id", user.user_id);
      
      // Fetch full user profile
      const profileResponse = await fetch(`http://127.0.0.1:8000/users/${user.user_id}`);
      const profile = await profileResponse.json();
      
      setCurrentUser(profile);
      setShowCreateUser(false);
    } catch (error) {
      alert(`Error creating user: ${error.message}`);
    }
  };

  const refreshUser = async () => {
    if (currentUser) {
      const response = await fetch(`http://127.0.0.1:8000/users/${currentUser.user_id}`);
      const updated = await response.json();
      setCurrentUser(updated);
    }
  };

  if (showCreateUser) {
    return <CreateUserForm onSubmit={handleCreateUser} />;
  }

  if (!currentUser) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0" }}>Congressional Betting Markets</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Predict outcomes on real congressional legislation with virtual currency
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setShowAdvancedCreate(true)}
            style={{
              padding: "8px 16px",
              background: "#10b981",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            + Create Market
          </button>
          <UserProfile user={currentUser} onRefresh={refreshUser} />
        </div>
      </div>

      {showAdvancedCreate ? (
        <CreateAdvancedMarket
          onCreated={(result) => {
            setShowAdvancedCreate(false);
            alert(`Market created successfully! Market ID: ${result.market_id}`);
            // Refresh markets list if we're showing it
            if (!selectedMarket) {
              window.location.reload(); // Simple refresh for now
            }
          }}
          onCancel={() => setShowAdvancedCreate(false)}
        />
      ) : selectedMarket ? (
        <div>
          <button 
            onClick={() => setSelectedMarket(null)}
            style={{ marginBottom: 16, padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc" }}
          >
            ← Back to Markets
          </button>
          <PlaceBet 
            market={selectedMarket} 
            user={currentUser} 
            onBetPlaced={refreshUser}
            onBack={() => setSelectedMarket(null)}
          />
        </div>
      ) : (
        <BettingMarkets onSelectMarket={setSelectedMarket} />
      )}
    </div>
  );
}

function CreateUserForm({ onSubmit }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      alert("Username is required");
      return;
    }
    
    setLoading(true);
    try {
      await onSubmit(username.trim(), email.trim() || null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: 40, 
      maxWidth: 400, 
      margin: "100px auto", 
      border: "1px solid #e5e7eb", 
      borderRadius: 12,
      background: "white"
    }}>
      <h2 style={{ marginBottom: 20, textAlign: "center" }}>Create Betting Account</h2>
      <p style={{ marginBottom: 20, color: "#666", fontSize: 14 }}>
        Get started with $1,000 in virtual currency to bet on congressional outcomes!
      </p>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Username *
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14
            }}
            placeholder="Choose a username"
            required
          />
        </div>
        
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Email (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14
            }}
            placeholder="your@email.com"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: loading ? "#ccc" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>
      </form>
    </div>
  );
}