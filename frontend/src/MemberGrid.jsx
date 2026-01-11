import { useEffect, useState, useMemo } from "react";
import { LoadingSpinner, ErrorMessage } from "./components";
import { MemberCard } from "./components/ui/MemberCard";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// All US states and territories
const ALL_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'GU', 'VI', 'AS', 'MP'
];

export default function MemberGrid({ onSelectMember }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [congress, setCongress] = useState(119);
  const [party, setParty] = useState("all");
  const [state, setState] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Available filter options
  const [availableCongresses, setAvailableCongresses] = useState([119, 118]);

  // Load filter options on mount
  useEffect(() => {
    fetch(`${API_URL}/members/filters`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data) => {
        if (data.congresses?.length) {
          setAvailableCongresses(data.congresses);
        }
      })
      .catch(() => {
        // Silently fail - use defaults
      });
  }, []);

  // Load members when filters change
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (congress) params.set('congress', congress.toString());
    if (party !== "all") params.set('party', party);
    if (state !== "all") params.set('state', state);
    params.set('limit', '500');

    fetch(`${API_URL}/members?${params}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => setMembers(data.members || []))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [congress, party, state]);

  // Client-side search filtering
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;

    const q = searchQuery.toLowerCase();
    return members.filter((m) =>
      m.name?.toLowerCase().includes(q) ||
      m.bioguideId?.toLowerCase().includes(q) ||
      m.state?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const clearFilters = () => {
    setCongress(119);
    setParty("all");
    setState("all");
    setSearchQuery("");
  };

  const hasActiveFilters = congress !== 119 || party !== "all" || state !== "all" || searchQuery;

  if (loading && members.length === 0) {
    return <LoadingSpinner message="Loading members..." />;
  }

  if (error) {
    return <ErrorMessage message={error} title="Error loading members:" />;
  }

  return (
    <div>
      {/* Filters */}
      <div className="bg-gray-50 p-3 rounded-lg mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name..."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
            />
          </div>

          {/* Congress */}
          <select
            value={congress}
            onChange={(e) => setCongress(parseInt(e.target.value))}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[140px]"
          >
            {availableCongresses.map((c) => (
              <option key={c} value={c}>{c}th Congress</option>
            ))}
          </select>

          {/* Party */}
          <select
            value={party}
            onChange={(e) => setParty(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[120px]"
          >
            <option value="all">All Parties</option>
            <option value="D">Democrat</option>
            <option value="R">Republican</option>
            <option value="I">Independent</option>
          </select>

          {/* State */}
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm min-w-[100px]"
          >
            <option value="all">All States</option>
            {ALL_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-2.5 cursor-pointer text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="mt-2 text-xs text-gray-500 mx-0.5">
          Showing <strong>{filteredMembers.length}</strong> members
          {congress && <> in the {congress}th Congress</>}
          {party !== "all" && <> ({party === "D" ? "Democrats" : party === "R" ? "Republicans" : "Independents"})</>}
          {state !== "all" && <> from {state}</>}
        </div>
      </div>

      {/* Members Grid */}
      {filteredMembers.length === 0 ? (
        <div className="p-10 text-center bg-gray-50 border border-dashed border-gray-400 rounded-lg text-gray-500">
          <div className="text-2xl mb-2">👤</div>
          <p className="m-0">
            {hasActiveFilters
              ? "No members match your filters."
              : "No members found."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => (
            <MemberCard
              key={member.bioguideId}
              member={member}
              onClick={() => onSelectMember?.(member.bioguideId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
