import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the value that only updates
 * after the specified delay has passed without changes.
 *
 * @param {any} value - The value to debounce
 * @param {number} delay - Delay in milliseconds (default: 400ms)
 * @returns {any} The debounced value
 */
export function useDebouncedValue(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
