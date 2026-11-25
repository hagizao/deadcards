import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import globals from "globals";
import { globSync, readFileSync } from "node:fs";

// Classes definidas nos nossos .css (fora do Tailwind) contam como conhecidas.
const cssClasses = [
  ...new Set(
    globSync("src/**/*.css").flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]),
    ),
  ),
].map((c) => `^${c}$`);

export default tseslint.config(
  { ignores: ["dist", ".claude", ".wrangler", "node_modules", "worker-configuration.d.ts", "explorations"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "warn" } },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-refresh": reactRefresh },
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
      // Regras do React Compiler: avisam, mas não travam o código que já funciona.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Providers de contexto exportam o hook junto; recarregar a página inteira no HMR aqui é aceitável.
  { files: ["src/lib/**/*.tsx"], rules: { "react-refresh/only-export-components": "off" } },
  {
    files: ["src/**/*.tsx"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/index.css" } },
    rules: {
      ...betterTailwind.configs["recommended-error"].rules,
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: cssClasses }],
    },
  },
  { files: ["scripts/**", "*.config.*"], languageOptions: { globals: globals.node } },
);
