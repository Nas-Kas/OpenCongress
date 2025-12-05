/**
 * Breadcrumb Component
 * 
 * Displays navigation breadcrumbs showing the user's current location in the app.
 * Each breadcrumb item is clickable for navigation.
 * 
 * @component
 * @param {Array} items - Array of breadcrumb items with structure:
 *   - label: string (display text)
 *   - onClick: function (callback when clicked)
 * @returns {JSX.Element} Breadcrumb navigation
 * 
 * @example
 * <Breadcrumb items={[
 *   { label: 'Home', onClick: () => navigate('/') },
 *   { label: 'Bills', onClick: () => navigate('/bills') },
 *   { label: 'HR 1234' }
 * ]} />
 */
export function Breadcrumb({ items = [] }) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <nav className="mb-4 text-sm" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isClickable = item.onClick && !isLast;

          return (
            <li key={index} className="flex items-center gap-2">
              {isClickable ? (
                <button
                  onClick={item.onClick}
                  className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={isLast ? 'text-gray-900 font-medium' : 'text-gray-600'}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <span className="text-gray-400">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
