import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const EXCELJS_ONLY = "exceljs solo se importa en src/modules/report/export/xlsx.ts.";

const config = [
  ...coreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      // Convenciones del proyecto: sin any, sin aserciones de no nulo y sin
      // silenciar al compilador. Una regla deshabilitada lleva justificación.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      // D-R6-12: la biblioteca de Excel, con su alerta de `uuid` aceptada,
      // queda encerrada en el escritor; los tests la usan para leer. Las
      // subrutas y el `import()` también cuentan.
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["exceljs", "exceljs/*"], message: EXCELJS_ONLY }] },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression[source.value=/^exceljs/]", message: EXCELJS_ONLY },
      ],
    },
  },
  {
    files: ["src/modules/report/export/xlsx.ts", "**/*.test.ts", "e2e/**"],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "src/server/db/auth-schema.ts",
    ],
  },
];

export default config;
