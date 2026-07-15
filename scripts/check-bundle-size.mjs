import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIRECTORY = join(process.cwd(), "dist", "assets");
const ENTRY_GZIP_LIMIT_BYTES = 300 * 1024;
const CHUNK_GZIP_LIMIT_BYTES = 250 * 1024;
const ENTRY_PATTERN = /^index-[\w-]+\.js$/;

const entryFiles = readdirSync(ASSETS_DIRECTORY).filter((fileName) =>
  ENTRY_PATTERN.test(fileName),
);

if (entryFiles.length !== 1) {
  throw new Error(
    `Expected one built application entry, found ${entryFiles.length}. Run npm run build first.`,
  );
}

const entryFile = entryFiles[0];
const entryPath = join(ASSETS_DIRECTORY, entryFile);
const gzipBytes = gzipSync(readFileSync(entryPath)).byteLength;

if (gzipBytes > ENTRY_GZIP_LIMIT_BYTES) {
  throw new Error(
    `${entryFile} is ${gzipBytes} gzip bytes; the limit is ${ENTRY_GZIP_LIMIT_BYTES}. Lazy-load optional features or reduce dependencies.`,
  );
}

const oversizedChunks = readdirSync(ASSETS_DIRECTORY)
  .filter((fileName) => fileName.endsWith(".js") && fileName !== entryFile)
  .map((fileName) => ({
    fileName,
    gzipBytes: gzipSync(readFileSync(join(ASSETS_DIRECTORY, fileName)))
      .byteLength,
  }))
  .filter((chunk) => chunk.gzipBytes > CHUNK_GZIP_LIMIT_BYTES);

if (oversizedChunks.length > 0) {
  const details = oversizedChunks
    .map((chunk) => `${chunk.fileName}: ${chunk.gzipBytes} gzip bytes`)
    .join(", ");
  throw new Error(
    `Bundle chunk limit is ${CHUNK_GZIP_LIMIT_BYTES} gzip bytes. Oversized chunks: ${details}`,
  );
}

console.log(
  `Bundle budgets passed: ${entryFile} is ${gzipBytes} gzip bytes; every optional JavaScript chunk is within ${CHUNK_GZIP_LIMIT_BYTES}.`,
);
