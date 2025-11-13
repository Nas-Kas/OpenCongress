import { useState } from "react";

export default function CreateAdvancedMarket({ onCreated, onCancel }) {
  const [marketType, setMarketType] = useState("bill_passage");
  const [congress, setCongress] = useState(119);
  const [billType, setBillType] = useState("hr");
  const [billNumber, setBillNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [billExists, setBillExists] = useState(true);
  
  // Member vote specific
  const [targetMember, setTargetMember] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  
  // Vote count specific
  const [targetCount, setTargetCount] = useState("");
  
  // Timeline specific
  const [targetDate, setTargetDate] = useState("");
  
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const searchMembers = async (query) => {
    if (query.length < 2) {
      setMemberResults([]);
      return;
    }
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/search/members?q=${encodeURIComponent(query)}&limit=10`);
      const results = await response.json();
      setMemberResults(results);
    } catch (err) {
      console.error("Failed to search members:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      // Create speculative bill first if needed
      if (!billExists) {
        const specResponse = await fetch("http://127.0.0.1:8000/speculative-bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            congress,
            bill_type: billType,
            bill_number: billNumber,
            title,
            description
          })
        });
        
        if (!specResponse.ok && specResponse.status !== 400) { // 400 might mean it already exists
          const errorData = await specResponse.json();
          throw new Error(errorData.detail || "Failed to create speculative bill");
        }
      }

      // Create the market
      const marketData = {
        congress,
        bill_type: billType,
        bill_number: billNumber,
        title,
        description,
        deadline: deadline || null,
        market_type: marketType,
        bill_exists: billExists
      };

      if (marketType === "member_vote") {
        marketData.target_member = targetMember;
      } else if (marketType === "vote_count") {
        marketData.target_count = parseInt(targetCount);
      } else if (marketType === "timeline") {
        marketData.target_date = targetDate;
      }

      const response = await fetch("http://127.0.0.1:8000/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(marketData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create market");
      }

      const result = await response.json();
      onCreated?.(result);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const getMarketDescription = () => {
    switch (marketType) {
      case "bill_passage":
        return "Bet on whether the bill will pass or fail";
      case "member_vote":
        return "Bet on how a specific member will vote (yes/no)";
      case "vote_count":
        return "Bet on whether the vote count will be over/under a target number";
      case "timeline":
        return "Bet on whether the vote will happen before/after a target date";
      default:
        return "";
    }
  };

  return (
    <div style={{
      background: "white",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 24,
      maxWidth: 600,
      margin: "0 auto"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          Create Advanced Betting Market
        </h3>
        <button onClick={onCancel} style={{ 
          background: "none", 
          border: "none", 
          fontSize: 20, 
          cursor: "pointer" 
        }}>
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Market Type Selection */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
            Market Type
          </label>
          <select
            value={marketType}
            onChange={(e) => setMarketType(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="bill_passage">Bill Passage (Pass/Fail)</option>
            <option value="member_vote">Member Vote (Yes/No)</option>
            <option value="vote_count">Vote Count (Over/Under)</option>
            <option value="timeline">Timeline (Before/After)</option>
          </select>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {getMarketDescription()}
          </div>
        </div>

        {/* Bill Information */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Congress</label>
            <input
              type="number"
              value={congress}
              onChange={(e) => setCongress(parseInt(e.target.value))}
              style={{
                width: 80,
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Bill Type</label>
            <select
              value={billType}
              onChange={(e) => setBillType(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14
              }}
            >
              <option value="hr">HR (House Bill)</option>
              <option value="s">S (Senate Bill)</option>
              <option value="hres">HRES (House Resolution)</option>
              <option value="sres">SRES (Senate Resolution)</option>
              <option value="hjres">HJRES (House Joint Resolution)</option>
              <option value="sjres">SJRES (Senate Joint Resolution)</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Bill Number</label>
            <input
              type="text"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              placeholder="e.g., 1234"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14
              }}
              required
            />
          </div>
        </div>

        {/* Bill Exists Toggle */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!billExists}
              onChange={(e) => setBillExists(!e.target.checked)}
            />
            <span style={{ fontSize: 14 }}>
              This is a speculative/future bill (doesn't exist yet)
            </span>
          </label>
        </div>

        {/* Title and Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Title {!billExists && <span style={{ color: "#ef4444" }}>*</span>}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bill title or market name"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14
            }}
            required={!billExists}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Market description or additional context"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14,
              minHeight: 80,
              resize: "vertical"
            }}
          />
        </div>

        {/* Market Type Specific Fields */}
        {marketType === "member_vote" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
              Target Member <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                searchMembers(e.target.value);
              }}
              placeholder="Search for a member by name..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14
              }}
            />
            {memberResults.length > 0 && (
              <div style={{
                border: "1px solid #e5e7eb",
                borderTop: "none",
                borderRadius: "0 0 6px 6px",
                maxHeight: 150,
                overflow: "auto",
                background: "white"
              }}>
                {memberResults.map(member => (
                  <button
                    key={member.bioguideId}
                    type="button"
                    onClick={() => {
                      setTargetMember(member.bioguideId);
                      setMemberSearch(`${member.name} (${member.party}-${member.state})`);
                      setMemberResults([]);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      background: "white",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 14
                    }}
                  >
                    {member.name} ({member.party}-{member.state})
                  </button>
                ))}
              </div>
            )}
            {targetMember && (
              <div style={{ fontSize: 12, color: "#10b981", marginTop: 4 }}>
                ✓ Selected: {memberSearch}
              </div>
            )}
          </div>
        )}

        {marketType === "vote_count" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
              Target Vote Count <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="number"
              value={targetCount}
              onChange={(e) => setTargetCount(e.target.value)}
              placeholder="e.g., 218 (majority threshold)"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14
              }}
              required
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Users will bet on whether the YES vote count will be over or under this number
            </div>
          </div>
        )}

        {marketType === "timeline" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
              Target Date <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14
              }}
              required
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Users will bet on whether the vote will happen before or after this date
            </div>
          </div>
        )}

        {/* Deadline */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Betting Deadline (optional)
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            color: "#dc2626",
            marginBottom: 16,
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="submit"
            disabled={creating || (marketType === "member_vote" && !targetMember) || 
                     (marketType === "vote_count" && !targetCount) ||
                     (marketType === "timeline" && !targetDate)}
            style={{
              flex: 1,
              padding: "12px 20px",
              background: creating ? "#e5e7eb" : "#2563eb",
              color: creating ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: creating ? "not-allowed" : "pointer"
            }}
          >
            {creating ? "Creating..." : "Create Market"}
          </button>
          
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "12px 20px",
              background: "white",
              color: "#374151",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}