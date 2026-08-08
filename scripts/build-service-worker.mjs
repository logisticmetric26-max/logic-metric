#!/usr/bin/env node
/**
 * Genera `public/sw.js` a partir de la plantilla, estampando la versión del
 * build.
 *
 * Sin esto, el archivo del service worker sería byte a byte idéntico entre
 * despliegues y el navegador no detectaría que hay una versión nueva.
 *
 * La versión sale del hash del contenido más la marca de tiempo del build: dos
 * despliegues distintos producen siempre versiones distintas.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "src", "pwa", "service-worker.js");
const OUTPUT = join(ROOT, "public", "sw.js");

const source = readFileSync(TEMPLATE, "utf8");

const contentHash = createHash("sha256").update(source).digest("hex").slice(0, 8);
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? Date.now().toString(36);
const version = `${contentHash}-${buildId}`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, source.replaceAll("__SW_VERSION__", version));

console.log(`  ✓ public/sw.js (versión ${version})`);
