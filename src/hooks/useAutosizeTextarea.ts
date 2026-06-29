import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Keeps a textarea height in sync with its content (min height = minRows lines).
 */
export function useAutosizeTextarea(value: string, minRows: number) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || 21;
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const minH = minRows * lineHeight + padding;
    ta.style.height = `${Math.max(ta.scrollHeight, minH)}px`;
  }, [minRows]);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return ref;
}
