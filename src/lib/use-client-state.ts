"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * State that can only be read on the client (localStorage, in our case).
 *
 * This has to happen in an effect rather than a lazy `useState` initializer:
 * the first client render must produce the same markup as the prerendered
 * HTML, and the server has no storage to read from. So we render `fallback`
 * first, then swap in the real value and flip `ready` once mounted.
 *
 * Returns `[value, ready, setValue]`.
 */
export function useClientState<T>(
  load: () => T,
  fallback: T,
): [T, boolean, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  const loadRef = useRef(load);

  useEffect(() => {
    setValue(loadRef.current());
    setReady(true);
  }, []);

  return [value, ready, setValue];
}
