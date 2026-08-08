import "server-only";

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker, type Worker } from "tesseract.js";

/**
 * §24 · OCR local de páginas escaneadas.
 *
 * Todo ocurre en el servidor: el PDF no sale de la máquina, no hay cuenta ni
 * clave de por medio y no hay límite de uso.
 *
 * Tesseract no es un modelo de lenguaje: reconoce caracteres. Corre bien en CPU
 * (≈1-5 s por página según tamaño), a diferencia de un modelo de visión, que en
 * un equipo sin aceleración tardaría minutos por página.
 */

/** Modelo de idioma de Tesseract. Se descarga una vez y queda en disco. */
const OCR_DATA_DIR = join(process.cwd(), ".ocr-data");
const LANGUAGE = "spa";
const TRAINED_DATA = join(OCR_DATA_DIR, `${LANGUAGE}.traineddata.gz`);
const TRAINED_DATA_URL = `https://tessdata.projectnaptha.com/4.0.0/${LANGUAGE}.traineddata.gz`;

/**
 * Escala de rasterizado. A 2× el texto queda lo bastante nítido para Tesseract
 * sin disparar la memoria: una A4 pasa a ~1190×1684 px.
 */
const RENDER_SCALE = 2;

/** Tope de páginas a reconocer: evita que un PDF anómalo bloquee el servidor. */
const MAX_OCR_PAGES = 30;

export interface OcrPageResult {
  page_number: number;
  text: string;
  /** Confianza media de Tesseract para la página, de 0 a 1. */
  confidence: number;
}

/**
 * Garantiza que el modelo de idioma esté en disco.
 *
 * Se descarga una única vez (~8 MB). A partir de ahí el análisis funciona sin
 * conexión.
 */
export async function ensureLanguageData(): Promise<void> {
  if (existsSync(TRAINED_DATA)) return;

  await mkdir(OCR_DATA_DIR, { recursive: true });

  const response = await fetch(TRAINED_DATA_URL);
  if (!response.ok) {
    throw new Error(
      `No se pudo descargar el modelo de OCR (HTTP ${response.status}). ` +
        "Ejecute `npm run ocr:setup` con conexión a internet.",
    );
  }

  await writeFile(TRAINED_DATA, Buffer.from(await response.arrayBuffer()));
}

export function isLanguageDataInstalled(): boolean {
  return existsSync(TRAINED_DATA);
}

/**
 * Rasteriza las páginas indicadas y les aplica OCR.
 *
 * Reutiliza un único worker para todas las páginas: arrancar Tesseract es lo
 * más caro del proceso, y hacerlo una vez por página multiplicaría el tiempo.
 * Las páginas se procesan en serie para no disparar la memoria con documentos
 * largos.
 */
export async function ocrPdfPages(
  bytes: Uint8Array,
  pageNumbers: number[],
): Promise<OcrPageResult[]> {
  if (pageNumbers.length === 0) return [];

  await ensureLanguageData();

  const targets = pageNumbers.slice(0, MAX_OCR_PAGES);
  const results: OcrPageResult[] = [];

  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    useSystemFonts: true,
    stopAtErrors: false,
  });

  let worker: Worker | undefined;

  try {
    const document = await loadingTask.promise;

    worker = await createWorker(LANGUAGE, 1, {
      langPath: OCR_DATA_DIR,
      cachePath: OCR_DATA_DIR,
      gzip: true,
      // Sin logger: el progreso de Tesseract inundaría los registros
      logger: () => {},
    });

    for (const pageNumber of targets) {
      try {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: RENDER_SCALE });

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");

        // Fondo blanco: un PDF sin fondo se rasteriza transparente y Tesseract
        // lo interpreta como negro, perdiendo todo el texto.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          // @napi-rs/canvas es compatible con la API que espera pdfjs
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        const { data } = await worker.recognize(canvas.toBuffer("image/png"));

        results.push({
          page_number: pageNumber,
          text: data.text.trim(),
          confidence: Math.min(1, Math.max(0, (data.confidence ?? 0) / 100)),
        });

        page.cleanup();
      } catch {
        // Una página ilegible no invalida el resto del documento
        results.push({ page_number: pageNumber, text: "", confidence: 0 });
      }
    }
  } finally {
    await worker?.terminate().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }

  return results;
}
