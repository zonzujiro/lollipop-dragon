import { downloadTextFile } from "../../../browser/download";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";

export function downloadActiveFile(): void {
  const state = useAppStore.getState();
  const { isPeerMode, peerActiveFilePath, peerRawContent } = state;
  if (isPeerMode) {
    if (!peerActiveFilePath) {
      return;
    }
    const fileName = peerActiveFilePath.split("/").pop() ?? peerActiveFilePath;
    downloadTextFile(fileName, peerRawContent);
    return;
  }
  const tab = getActiveTab(state);
  if (!tab) {
    return;
  }
  const filePath = tab.activeFilePath ?? tab.fileName;
  if (!filePath) {
    return;
  }
  const fileName = filePath.split("/").pop() ?? filePath;
  downloadTextFile(fileName, tab.rawContent);
}
