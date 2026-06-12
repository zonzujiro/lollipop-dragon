import {
  buildFileTree,
  openDirectory,
  openFile,
  readFile,
  writeFile,
} from "../services/fileSystem";
import type { WorkspaceRuntime } from "./workspace";

export const webWorkspaceRuntime: WorkspaceRuntime = {
  openFile,
  openDirectory,
  readFile,
  writeFile,
  buildFileTree,
};
