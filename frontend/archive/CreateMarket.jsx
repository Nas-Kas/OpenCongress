import { useState } from "react";

export default function CreateMarket({ congress, billType, billNumber, title, onCreated }) {
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("http://127.0.0.1:8000/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          congress,
          bill_type: billType,
          bill_number: billNumber,
          title,
          description: description.trim() || null,
          deadline: deadline || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create market");
      }

      const result = await response.json();
      onCreated?.(result);
      
      // Reset form
      setDescription("");
      setDeadline("");
      
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Default deadline to 30 days from now
  const defaultDeadline = new Date();
  defaultDeadline.setDate(defaultDeadline.getDate() + 30);
  const defaultDeadlineStr = defaultDeadline.toISOString().slice(0, 16);

  return (
    <div style={{
      background: "white",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      padding: 20,
      marginTop: 16
    }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>
        Create Betting Market
      </h3>
      
      <div style={{ marginBottom: 16, padding: 12, background: "#f8fafc", borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {billType.toUpperCase()} {billNumber}
        </div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          {title || "No title available"}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Market Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add context about what this market is betting on..."
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

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
            Betting Deadline (optional)
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14
            }}
          />
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Leave empty for no deadline. Suggested: {defaultDeadlineStr.replace('T', ' at ')}
          </div>
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
            disabled={creating}
            style={{
              padding: "10px 20px",
              background: creating ? "#e5e7eb" : "#2563eb",
              color: creating ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: creating ? "not-allowed" : "pointer"
            }}
          >
            {creating ? "Creating..." : "Create Market"}
          </button>
          
          <button
            type="button"
            onClick={() => setDeadline(defaultDeadlineStr)}
            style={{
              padding: "10px 20px",
              background: "white",
              color: "#374151",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer"
            }}
          >
            Use Default Deadline
          </button>
        </div>
      </form>
    </div>
  );
}