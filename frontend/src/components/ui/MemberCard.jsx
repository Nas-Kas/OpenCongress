/**
 * MemberCard Component
 *
 * Displays a member of Congress with photo, name, party, and state.
 * Used in member listings and search results.
 *
 * @component
 * @param {object} member - Member data object with properties:
 *   - bioguideId: string
 *   - name: string
 *   - party: string (D, R, I)
 *   - state: string (e.g., CA, TX)
 *   - imageUrl: string (optional)
 * @param {function} onClick - Callback when card is clicked
 * @returns {JSX.Element} Styled member card
 */
export function MemberCard({ member, onClick }) {
  const getPartyColor = (party) => {
    switch (party?.toUpperCase()) {
      case 'D':
        return 'bg-blue-600';
      case 'R':
        return 'bg-red-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getPartyLabel = (party) => {
    switch (party?.toUpperCase()) {
      case 'D':
        return 'Democrat';
      case 'R':
        return 'Republican';
      case 'I':
        return 'Independent';
      default:
        return party || 'Unknown';
    }
  };

  return (
    <div
      className="border border-gray-300 rounded-lg p-4 bg-white transition-all duration-200 cursor-pointer hover:border-blue-600 hover:shadow-lg hover:shadow-blue-100 flex items-center gap-4"
      onClick={onClick}
    >
      {/* Photo */}
      {member.imageUrl ? (
        <img
          src={member.imageUrl}
          alt={member.name}
          className="w-16 h-16 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl font-bold flex-shrink-0">
          {member.name?.[0] || '?'}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="m-0 text-base font-semibold text-gray-900 truncate">
          {member.name}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <span className={`${getPartyColor(member.party)} text-white px-2 py-0.5 rounded text-xs font-semibold`}>
            {member.party}
          </span>
          <span className="text-sm text-gray-600">
            {member.state}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {getPartyLabel(member.party)} - {member.state}
        </div>
      </div>

      {/* Arrow */}
      <div className="text-gray-400 flex-shrink-0">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
