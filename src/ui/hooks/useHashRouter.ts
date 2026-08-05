import { useEffect, useState } from "react";
import { useAppStore } from "../../store";
import { isShareHash } from "../../utils/shareUrl";
import { WORKER_URL } from "../../config";
import { stopRelay } from "../../modules/relay";

export function useHashRouter(): boolean {
  const loadSharedContent = useAppStore((s) => s.loadSharedContent);
  const restoreTabs = useAppStore((s) => s.restoreTabs);
  const leavePeerMode = useAppStore((s) => s.leavePeerMode);
  const [peerModeChecked, setPeerModeChecked] = useState(false);

  useEffect(() => {
    async function restoreWorkspace() {
      try {
        await restoreTabs();
      } catch (error) {
        console.warn("[useHashRouter] failed to restore tabs:", error);
      }
    }

    function checkHash() {
      if (isShareHash() && WORKER_URL) {
        if (!useAppStore.getState().isPeerMode) {
          stopRelay();
        }
        loadSharedContent()
          .catch((error: unknown) => {
            console.warn(
              "[useHashRouter] failed to load shared content:",
              error,
            );
          })
          .finally(() => setPeerModeChecked(true));
      } else {
        if (useAppStore.getState().isPeerMode) {
          stopRelay();
          leavePeerMode();
        }
        setPeerModeChecked(true);
        void restoreWorkspace();
      }
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return peerModeChecked;
}
