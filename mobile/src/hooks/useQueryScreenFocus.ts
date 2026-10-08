import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

// A navigation event updates this even when freezeOnBlur defers React renders.
export function useQueryScreenFocus() {
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  return focused;
}
