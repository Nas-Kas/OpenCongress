/**
 * BillCard Component
 * 
 * Displays a bill with title, number, date, and optional badge.
 * Used in bill listings and search results.
 * 
 * @component
 * @param {object} bill - Bill data object with properties:
 *   - title: string
 *   - billType: string (e.g., 'hr', 's')
 *   - billNumber: number
 *   - introducedDate: string (ISO date)
 *   - latestAction: string or object with text property
 * @param {string} [badge] - Optional badge text to display (e.g., "🎯 No Votes Yet")
 * @param {function} onClick - Callback when card is clicked
 * @returns {JSX.Element} Styled bill card
 * 
 * @example
 * <BillCard 
 *   bill={bill}
 *   badge="🎯 No Votes Yet"
 *   onClick={() => navigateToBill(bill)}
 * />
 */
export function BillCard({ bill, badge, onClick }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getLatestActionText = (latestAction) => {
    if (!latestAction) return 'No recent action';
    if (typeof latestAction === 'string') return latestAction;
    if (typeof latestAction === 'object' && latestAction.text) return latestAction.text;
    return 'No recent action';
  };

  return (
    <div
      className="border border-gray-300 rounded-lg p-5 bg-white transition-all duration-200 cursor-pointer hover:border-blue-600 hover:shadow-lg hover:shadow-blue-100"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold">
              {bill.billType.toUpperCase()} {bill.billNumber}
            </span>
            <span className="text-xs text-gray-500">
              Introduced: {formatDate(bill.introducedDate)}
            </span>
          </div>

          <h3 className="m-0 mb-3 text-lg leading-relaxed text-gray-800">
            {bill.title || `${bill.billType.toUpperCase()} ${bill.billNumber}`}
          </h3>

          <div className="text-sm text-gray-500 leading-relaxed">
            <strong>Latest Action:</strong> {getLatestActionText(bill.latestAction)}
          </div>
        </div>

        {badge && (
          <div className="bg-green-50 text-green-800 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ml-4">
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}
