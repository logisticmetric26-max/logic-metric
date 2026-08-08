import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Pruebas unitarias de la lógica pura: validación de RUT y PPU, normalización,
 * formato de fechas y traducción de errores.
 *
 * Las reglas de negocio críticas (RLS, aislamiento por terminal, unicidad de
 * proceso abierto, documentos obligatorios, vencimientos) se prueban donde
 * realmente viven —en PostgreSQL— con `npm run test:db`; ver `supabase/tests/`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
