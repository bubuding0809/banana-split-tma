import { config } from "@repo/eslint-config/react-internal";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "better-tailwindcss": betterTailwindcss,
    },
    settings: {
      "better-tailwindcss": {
        // Point the plugin at the Tailwind v4 CSS entry so it can
        // resolve the theme (default + any @theme overrides) when
        // validating classes.
        entryPoint: "src/index.css",
      },
    },
    rules: {
      // Start conservative — all warn (not error) so existing code
      // doesn't block CI. `enforce-consistent-class-order` stays off
      // because prettier-plugin-tailwindcss already handles ordering
      // on save.
      "better-tailwindcss/enforce-canonical-classes": "warn",
      "better-tailwindcss/no-conflicting-classes": "warn",
      "better-tailwindcss/no-duplicate-classes": "warn",
      "better-tailwindcss/no-unknown-classes": [
        "warn",
        {
          // Custom @layer utilities defined in src/index.css. The
          // plugin can't detect them from the v4 CSS config, so list
          // them explicitly.
          ignore: [
            "no-scrollbar",
            "animate-badge-pop",
            "animate-badge-shake",
            "mobile-body",
            "mobile-wrap",
            "mobile-content",
          ],
        },
      ],
      // Cleans up stray double spaces left behind when other rules
      // autofix adjacent classes (e.g. h-9 w-9 → size-9).
      "better-tailwindcss/no-unnecessary-whitespace": "warn",
    },
  },
  {
    ignores: ["src/routeTree.gen.ts"],
  },
];
