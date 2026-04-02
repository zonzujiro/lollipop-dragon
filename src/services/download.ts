import { useAppStore } from "../store";
import { getActiveTab } from "../store/selectors";

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadActiveFile(): void {
  const state = useAppStore.getState();
  const { isPeerMode, peerActiveFilePath, peerRawContent } = state;
  if (isPeerMode) {
    if (!peerActiveFilePath) {
      return;
    }
    const fileName = peerActiveFilePath.split("/").pop() ?? peerActiveFilePath;
    downloadFile(fileName, peerRawContent);
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
  downloadFile(fileName, tab.rawContent);
}
