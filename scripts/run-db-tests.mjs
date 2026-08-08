#!/usr/bin/env node
/**
 * Ejecuta la batería de pruebas SQL contra una base con las migraciones ya
 * aplicadas.
 *
 *   supabase start && supabase db reset
 *   npm run test:db
 *
 * Cada archivo corre dentro de una transacción que termina en ROLLBACK, así que
 * las pruebas no dejan datos: nunca hay fixtures en la base real (§75).
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = join(HERE, "..", "supabase", "tests");

// Puerto por defecto de la base de datos de `supabase start`
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function psql(file) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", DATABASE_URL, "-f", file], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  console.log(`▸ Base de datos: ${DATABASE_URL.replace(/:[^:@]*@/, ":***@")}\n`);

  try {
    psql(join(TESTS_DIR, "_helpers.sql"));
  } catch (error) {
    console.error("✖ No se pudieron instalar las utilidades de test.");
    console.error(error.stderr ?? error.message);
    process.exit(1);
  }

  const files = readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith(".test.sql"))
    .sort();

  if (files.length === 0) {
    console.error("✖ No se encontró ningún archivo *.test.sql");
    process.exit(1);
  }

  let failed = 0;

  for (const file of files) {
    try {
      psql(join(TESTS_DIR, file));
      console.log(`  ✓ ${file}`);
    } catch (error) {
      failed += 1;
      console.log(`  ✖ ${file}`);
      const output = `${error.stderr ?? ""}${error.stdout ?? ""}`.trim();
      console.log(
        output
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => `      ${line}`)
          .join("\n"),
      );
    }
  }

  console.log(
    failed === 0
      ? `\n✅ ${files.length} archivos de prueba SQL sin fallos`
      : `\n❌ ${failed} de ${files.length} archivos de prueba fallaron`,
  );

  process.exit(failed === 0 ? 0 : 1);
}

main();
