/**
 * ResultBadge Component
 * 
 * Displays a vote result (Passed/Failed/Other) with appropriate styling.
 * Used in vote tables to show vote outcomes.
 * 
 * @component
 * @param {string} result - The result value: 'Passed', 'Failed', or other
 * @returns {JSX.Element} Styled result badge
 * 
 * @example
 * <ResultBadge result="Passed" />
 * <ResultBadge result="Failed" />
 * <ResultBadge result="Agreed to" />
 */
export function ResultBadge({ result }) {
  const classifyResult = (res) => {
    const s = (res || '').toLowerCase();
    if (s.includes('pass') || s.includes('agreed')) return 'passed';
    if (s.includes('fail') || s.includes('reject')) return 'failed';
    return 'other';
  };

  const cls = classifyResult(result);
  const colorClass =
    cls === 'passed'
      ? 'bg-green-50 text-green-800'
      : cls === 'failed'
        ? 'bg-red-50 text-red-800'
        : 'bg-gray-50 text-gray-800';

  return (
    <span className={`${colorClass} px-2.5 py-1 rounded-full text-xs font-bold`}>
      {result || '—'}
    </span>
  );
}
