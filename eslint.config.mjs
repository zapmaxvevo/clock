import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * D-R6-12, D-R7-9: cada biblioteca, encerrada en su archivo. Las subrutas y el
 * `import()` también cuentan; esquery corta la regex en la primera «/», así que
 * la barra de los selectores es `\x2F`.
 */
const PDF_ONLY = "pdfkit y fontkit solo se importan en src/modules/report/export/pdf.ts.";
const LIBRARIES = {
  exceljs: {
    pattern: { group: ["exceljs", "exceljs/*"] },
    selector: "^exceljs(\\x2F|$)",
    message: "exceljs solo se importa en src/modules/report/export/xlsx.ts.",
  },
  pdfkit: {
    pattern: { group: ["pdfkit", "pdfkit/*"] },
    selector: "^pdfkit(\\x2F|$)",
    message: PDF_ONLY,
  },
  fontkit: {
    pattern: { group: ["fontkit", "fontkit/*"] },
    selector: "^fontkit(\\x2F|$)",
    message: PDF_ONLY,
  },
  reactPdf: {
    pattern: { group: ["@react-pdf/*"] },
    selector: "^@react-pdf\\x2F",
    message: "@react-pdf/* no se usa: el PDF se dibuja con pdfkit (ADR 0022).",
  },
  // Es de desarrollo: en un archivo de producción llegaría a la función.
  pdfjs: {
    pattern: { group: ["pdfjs-dist", "pdfjs-dist/*"] },
    selector: "^pdfjs-dist(\\x2F|$)",
    message: "pdfjs-dist solo se importa en los tests, src/test/ y e2e/.",
  },
  // Un helper puede traer pdfjs-dist: por `@/test/` o por la ruta relativa.
  testHelpers: {
    pattern: { regex: "^(@/test|\\.\\.?/(.*/)?test)(/|$)" },
    selector: "^(@\\x2Ftest|\\.\\.?\\x2F(.*\\x2F)?test)(\\x2F|$)",
    message: "Los helpers de src/test/ solo se importan en los tests, src/test/ y e2e/.",
  },
};

/** Las reglas que prohíben `names`, estáticos y con `import()`. */
function restricted(names) {
  const libraries = names.map((name) => LIBRARIES[name]);
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: libraries.map(({ pattern, message }) => ({ ...pattern, message })),
      },
    ],
    "no-restricted-syntax": [
      "error",
      ...libraries.map(({ selector, message }) => ({
        selector: `ImportExpression[source.value=/${selector}/]`,
        message,
      })),
    ],
  };
}

const EVERY_LIBRARY = Object.keys(LIBRARIES);

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
      ...restricted(EVERY_LIBRARY),
    },
  },
  // D-R6-12: la de Excel, con su alerta de `uuid` aceptada, en su escritor.
  {
    files: ["src/modules/report/export/xlsx.ts"],
    rules: restricted(EVERY_LIBRARY.filter((name) => name !== "exceljs")),
  },
  // D-R7-4: las del PDF, en el suyo.
  {
    files: ["src/modules/report/export/pdf.ts"],
    rules: restricted(
      EVERY_LIBRARY.filter((name) => name !== "pdfkit" && name !== "fontkit"),
    ),
  },
  // Los tests leen con todas; `@react-pdf/*` no vuelve sin un ADR.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "src/test/**", "e2e/**"],
    rules: restricted(["reactPdf"]),
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
