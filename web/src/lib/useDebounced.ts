import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `ms` -- for search boxes, so a
 *  request fires per pause rather than per keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
