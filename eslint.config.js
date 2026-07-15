import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const unsafeTypeRules = {
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
};

export default defineConfig([
  globalIgnores(["coverage", "dist", "src-tauri/target", "outputs"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...unsafeTypeRules,
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/unbound-method": "error",
      "@typescript-eslint/no-base-to-string": "error",
      curly: ["error", "all"],
      "max-params": ["error", 4],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression",
          message:
            "Type assertions are forbidden; narrow or validate the value at its boundary.",
        },
        {
          selector: "SwitchStatement",
          message: "Use a typed dispatch map instead of switch/case.",
        },
        {
          selector:
            "CallExpression[callee.type='ArrowFunctionExpression'], CallExpression[callee.type='FunctionExpression']",
          message: "Extract IIFEs into named functions.",
        },
      ],
    },
  },
  {
    files: [
      "**/*.test.{ts,tsx}",
      "**/test/**/*.{ts,tsx}",
      "src/testing/**/*.{ts,tsx}",
    ],
    rules: {
      ...Object.fromEntries(
        Object.keys(unsafeTypeRules).map((ruleName) => [ruleName, "off"]),
      ),
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    // Browser file handles are experimental and represented by local ambient
    // declarations. Keep unsafe-type lint focused on parsed business data.
    files: [
      "src/services/fileSystem.ts",
      "src/modules/workspace/controller.ts",
      "src/modules/sharing/controller.ts",
      "src/ui/components/FilePicker/FilePicker.tsx",
    ],
    rules: {
      ...Object.fromEntries(
        Object.keys(unsafeTypeRules).map((ruleName) => [ruleName, "off"]),
      ),
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]);
