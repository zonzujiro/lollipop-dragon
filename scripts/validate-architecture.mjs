import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const SOURCE_DIRECTORY = resolve("src");
const PRODUCTION_FILE_PATTERN = /\.(?:ts|tsx)$/;
const TEST_PATH_PATTERN =
  /(?:^|\/)(?:test|testing)(?:\/|$)|\.test\.(?:ts|tsx)$/;
const COMPONENT_LINE_LIMIT = 1000;
const REQUIRED_MODULE_README_SECTIONS = [
  "## Purpose",
  "## Owns",
  "## Does not own",
  "## Public API",
  "## Invariants",
];
const FOCUSED_UI_HOOK_COMPONENTS = new Set([
  "src/ui/components/CommentMargin/CommentMargin.tsx",
  "src/ui/components/CommentPanel/CommentPanel.tsx",
  "src/ui/components/MarkdownRenderer/MarkdownRenderer.tsx",
]);
const IMPORT_PATTERN =
  /(?:import|export)\s+(type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_PATTERN = /import\(["']([^"']+)["']\)/g;

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
    } else if (PRODUCTION_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function toProjectPath(filePath) {
  return relative(process.cwd(), filePath).split(sep).join("/");
}

function resolveSourceImport(importer, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const unresolved = resolve(dirname(importer), specifier);
  const candidates = extname(unresolved)
    ? [unresolved]
    : [
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        join(unresolved, "index.ts"),
        join(unresolved, "index.tsx"),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectImports(filePath) {
  const source = readFileSync(filePath, "utf8");
  const imports = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[2];
    if (specifier) {
      imports.push({ specifier, typeOnly: Boolean(match[1]) });
    }
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT_PATTERN)) {
    const specifier = match[1];
    if (specifier) {
      imports.push({ specifier, typeOnly: false });
    }
  }
  return imports;
}

const sourceFiles = listSourceFiles(SOURCE_DIRECTORY).filter(
  (filePath) => !TEST_PATH_PATTERN.test(toProjectPath(filePath)),
);
const graph = new Map();
const violations = [];

for (const filePath of sourceFiles) {
  const projectPath = toProjectPath(filePath);
  const imports = collectImports(filePath);
  const runtimeDependencies = [];

  for (const imported of imports) {
    const dependency = resolveSourceImport(filePath, imported.specifier);
    if (!dependency) {
      continue;
    }
    const dependencyPath = toProjectPath(dependency);
    if (
      projectPath.startsWith("src/modules/") &&
      dependencyPath.startsWith("src/store/")
    ) {
      violations.push(
        `${projectPath} imports ${dependencyPath}; feature modules must receive application dependencies through typed ports.`,
      );
    }
    if (
      projectPath.startsWith("src/ui/") &&
      /\/modules\/[^/]+\/(?:controller|state)\.(?:ts|tsx)$/.test(dependencyPath)
    ) {
      violations.push(
        `${projectPath} imports internal module implementation ${dependencyPath}; UI must use a module public API or selector.`,
      );
    }
    if (
      FOCUSED_UI_HOOK_COMPONENTS.has(projectPath) &&
      dependencyPath === "src/store/index.ts"
    ) {
      violations.push(
        `${projectPath} imports the root store directly; use a focused hook from src/store/uiHooks.ts.`,
      );
    }
    if (!imported.typeOnly) {
      runtimeDependencies.push(dependency);
    }
  }
  graph.set(filePath, runtimeDependencies);
}

for (const filePath of sourceFiles) {
  const projectPath = toProjectPath(filePath);
  if (
    projectPath.startsWith("src/ui/components/") &&
    projectPath.endsWith(".tsx")
  ) {
    const lineCount = readFileSync(filePath, "utf8").split("\n").length;
    if (lineCount > COMPONENT_LINE_LIMIT) {
      violations.push(
        `${projectPath} has ${lineCount} lines; split UI responsibilities before exceeding ${COMPONENT_LINE_LIMIT}.`,
      );
    }
  }
}

const modulesDirectory = join(SOURCE_DIRECTORY, "modules");
for (const moduleEntry of readdirSync(modulesDirectory, {
  withFileTypes: true,
})) {
  if (!moduleEntry.isDirectory()) {
    continue;
  }
  const readmePath = join(modulesDirectory, moduleEntry.name, "README.md");
  if (!existsSync(readmePath)) {
    violations.push(`src/modules/${moduleEntry.name}/README.md is missing.`);
    continue;
  }
  const readme = readFileSync(readmePath, "utf8");
  for (const section of REQUIRED_MODULE_README_SECTIONS) {
    if (!readme.includes(section)) {
      violations.push(
        `src/modules/${moduleEntry.name}/README.md is missing ${section}.`,
      );
    }
  }
  if (/\b(?:planned|target state|expected side effects)\b/i.test(readme)) {
    violations.push(
      `src/modules/${moduleEntry.name}/README.md describes planned ownership; document the current API and state instead.`,
    );
  }
}

const visited = new Set();
const active = new Set();
const stack = [];

function visit(filePath) {
  if (active.has(filePath)) {
    const cycleStart = stack.indexOf(filePath);
    const cycle = [...stack.slice(cycleStart), filePath]
      .map(toProjectPath)
      .join(" -> ");
    violations.push(`Runtime import cycle: ${cycle}`);
    return;
  }
  if (visited.has(filePath)) {
    return;
  }

  visited.add(filePath);
  active.add(filePath);
  stack.push(filePath);
  for (const dependency of graph.get(filePath) ?? []) {
    visit(dependency);
  }
  stack.pop();
  active.delete(filePath);
}

for (const filePath of sourceFiles) {
  visit(filePath);
}

if (violations.length > 0) {
  console.error("Architecture validation failed:\n");
  for (const violation of [...new Set(violations)]) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Architecture validation passed for ${sourceFiles.length} production TypeScript files.`,
  );
}
