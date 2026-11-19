import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".nitro", ".tanstack", "public/sw.js"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    // The app itself is one large .jsx file, which the TypeScript block above never
    // matched — so nothing checked it, and two references to names that do not exist
    // (kfmt, PRIV_KEY) shipped: one crashed the Overview, the other quietly stopped the
    // name-masking preference from saving. This block exists for that class of bug.
    extends: [js.configs.recommended],
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, React: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      "react-hooks/rules-of-hooks": "error",
      // noise rather than bugs in this codebase: unused arguments are often documentation
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "off",
      // These files predate prettier here and are hand-laid-out — reformatting 7,000
      // lines would bury every real change in whitespace. Style stays manual; this
      // block is only here to catch mistakes.
      "prettier/prettier": "off",
    },
  },
  {
    // the service worker runs in its own global scope, not the window's
    files: ["**/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
    rules: { "prettier/prettier": "off" },
  },
);