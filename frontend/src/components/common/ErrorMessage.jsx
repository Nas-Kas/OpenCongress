/**
 * ErrorMessage Component
 * 
 * A reusable error display component with consistent styling.
 * Used across the application for error states.
 * 
 * @component
 * @param {string} message - The error message to display
 * @param {string} [title] - Optional title/label for the error
 * @param {function} [onRetry] - Optional callback for retry button
 * @returns {JSX.Element} Error message container
 * 
 * @example
 * <ErrorMessage message="Failed to load bills" title="Error:" />
 * <ErrorMessage message={error} onRetry={() => refetch()} />
 */
export function ErrorMessage({ message, title, onRetry }) {
  return (
    <div className="p-5 bg-red-50 border border-red-200 rounded-lg text-red-600">
      {title && <strong>{title} </strong>}
      {message}
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-4 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer text-sm font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}
