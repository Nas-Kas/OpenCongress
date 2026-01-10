/**
 * LoadingSpinner Component
 *
 * A reusable loading indicator with optional message text.
 * Used across the application for consistent loading states.
 *
 * @component
 * @param {string} [message] - Optional message to display below the spinner
 * @param {string} [size='medium'] - Size of the spinner: 'small', 'medium', 'large'
 * @returns {JSX.Element} Loading spinner with optional message
 *
 * @example
 * <LoadingSpinner message="Loading bill details..." />
 * <LoadingSpinner message="Loading..." size="small" />
 */
export function LoadingSpinner({ message, size = 'medium' }) {
  const sizeClasses = {
    small: 'w-4 h-4 border-2',
    medium: 'w-5 h-5 border-2',
    large: 'w-6 h-6 border-2'
  };

  return (
    <div className="flex items-center justify-center p-10 gap-3">
      <div className={`${sizeClasses[size]} border-gray-300 border-t-blue-600 rounded-full animate-spin`} />
      {message && <span>{message}</span>}
    </div>
  );
}

/**
 * InlineSpinner Component
 *
 * A minimal spinner for inline use (e.g., inside input fields).
 * No wrapper padding - just the spinning circle.
 *
 * @component
 * @param {string} [size='small'] - Size: 'small' (16px), 'medium' (20px)
 * @param {string} [className] - Additional classes for positioning
 *
 * @example
 * <InlineSpinner />
 * <InlineSpinner size="medium" className="absolute right-3 top-1/2 -translate-y-1/2" />
 */
export function InlineSpinner({ size = 'small', className = '' }) {
  const sizeClasses = {
    small: 'w-4 h-4 border-2',
    medium: 'w-5 h-5 border-2'
  };

  return (
    <div
      className={`${sizeClasses[size]} border-gray-300 border-t-blue-600 rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
