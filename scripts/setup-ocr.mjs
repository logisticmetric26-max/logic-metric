#!/usr/bin/env node
/**
 * Descarga el modelo de idioma que usa el OCR local.
 *
 *   npm run ocr:setup
 *
 * Son ~8 MB y se descargan UNA sola vez. A partir de ahí el análisis de
 * documentos funciona sin conexión y sin depender de ningún servicio externo.
 *
 * No es obligatorio ejecutarlo: si el modelo falta, la aplicación lo descarga
 * sola la primera vez que analiza un documento escaneado. Este script sirve
 * para dejarlo listo por adelantado — por ejemplo, en un despliegue.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, ".ocr-data");
const LANGUAGE = "spa";
const TARGET = join(OUT_DIR, `${LANGUAGE}.traineddata.gz`);
const URL = `https://tessdata.projectnaptha.com/4.0.0/${LANGUAGE}.traineddata.gz`;

if (existsSync(TARGET)) {
  const mb = (statSync(TARGET).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ El modelo de OCR ya está instalado (${mb} MB)\n   ${TARGET}\n`);
  process.exit(0);
}

console.log("\n▸ Descargando el modelo de OCR en español…");

try {
  const response = await fetch(URL);

  if (!response.ok) {
    throw new Error(`el servidor respondió HTTP ${response.status}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(TARGET, bytes);

  console.log(`\n✅ Modelo instalado (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   ${TARGET}`);
  console.log("\n   El análisis de documentos ya funciona sin conexión.\n");
} catch (error) {
  console.error(`\n✖ No se pudo descargar el modelo: ${error.message}`);
  console.error("  Verifique su conexión e intente nuevamente.\n");
  process.exit(1);
}
