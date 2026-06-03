import { useEffect, useState } from "react";
import { useAppStore } from "../../store";
import { isShareHash } from "../../utils/shareUrl";
import { WORKER_URL } from "../../config";

export function useHashRouter(): boolean {
  const loadSharedContent = useAppStore((s) => s.loadSharedContent);
  const restoreTabs = useAppStore((s) => s.restoreTabs);
  const [peerModeChecked, setPeerModeChecked] = useState(false);

  useEffect(() => {
    function checkHash() {
      if (isShareHash() && WORKER_URL) {
        loadSharedContent()
          .catch((error: unknown) => {
            console.warn("[useHashRouter] failed to load shared content:", error);
          })
          .finally(() => setPeerModeChecked(true));
      } else {
        setPeerModeChecked(true);
        restoreTabs();
      }
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return peerModeChecked;
}
