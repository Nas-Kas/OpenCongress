/**
 * VoteButton Component
 * 
 * Displays a vote status with appropriate color coding.
 * Used in vote tables and member voting records.
 * 
 * @component
 * @param {string} vote - The vote value: 'Yea', 'Nay', 'Present', 'Not Voting', or '—'
 * @returns {JSX.Element} Styled vote button/chip
 * 
 * @example
 * <VoteButton vote="Yea" />
 * <VoteButton vote="Nay" />
 * <VoteButton vote="Present" />
 */
export function VoteButton({ vote }) {
  const position = vote || '—';

  const getVoteClasses = (voteValue) => {
    const baseClasses = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold';
    switch (voteValue) {
      case 'Yea':
        return `${baseClasses} bg-vote-yea-bg text-vote-yea-fg`;
      case 'Nay':
        return `${baseClasses} bg-vote-nay-bg text-vote-nay-fg`;
      case 'Present':
        return `${baseClasses} bg-vote-present-bg text-vote-present-fg`;
      case 'Not Voting':
        return `${baseClasses} bg-vote-nv-bg text-vote-nv-fg`;
      default:
        return `${baseClasses} bg-vote-present-bg text-vote-present-fg`;
    }
  };

  return (
    <span
      aria-label={`Vote: ${position}`}
      title={`Vote: ${position}`}
      className={getVoteClasses(position)}
    >
      {position}
    </span>
  );
}
