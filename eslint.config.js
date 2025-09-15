import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": ["error", { caughtErrorsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-var": "error",
      "prefer-arrow-callback": "error",
      "arrow-spacing": "error",
      "no-duplicate-imports": "error",
    },
  },
  {
    ignores: ["node_modules/", "test/", ".vscode/", ".github/"],
  },
];
