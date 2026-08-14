/**
 * Generador de PDF de una sola página.
 *
 * Escribe los bytes del PDF a mano en lugar de traer una librería. El documento
 * que se necesita es texto y líneas sobre una hoja carta; una dependencia de
 * PDF traería tipografías incrustadas, gráficos vectoriales y un compilador de
 * layout que aquí no se usarían, y ya tuvimos un despliegue roto por el
 * lockfile: cada paquete nuevo es un riesgo que hay que justificar.
 *
 * Se usan las fuentes base del formato (Helvetica), que TODO lector de PDF
 * incluye por definición, así que no hay que incrustar nada.
 */

/** Carta, en puntos (1 pt = 1/72"). */
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

export type PdfFont = "Helvetica" | "Helvetica-Bold";

interface TextOp {
  kind: "text";
  x: number;
  y: number;
  size: number;
  font: PdfFont;
  gray: number;
  value: string;
}

interface LineOp {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  gray: number;
}

interface RectOp {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  gray: number;
}

type Op = TextOp | LineOp | RectOp;

/**
 * Lienzo de una página.
 *
 * El origen del PDF está abajo a la izquierda; aquí se trabaja desde ARRIBA,
 * que es como se piensa una hoja, y la conversión se hace al emitir.
 */
export class PdfPage {
  private ops: Op[] = [];

  text(
    value: string,
    { x, y, size = 10, font = "Helvetica", gray = 0 }: {
      x: number;
      y: number;
      size?: number;
      font?: PdfFont;
      gray?: number;
    },
  ): void {
    this.ops.push({ kind: "text", x, y: PAGE_HEIGHT - y, size, font, gray, value });
  }

  line({ x1, y1, x2, y2, width = 0.5, gray = 0.75 }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width?: number;
    gray?: number;
  }): void {
    this.ops.push({
      kind: "line",
      x1,
      y1: PAGE_HEIGHT - y1,
      x2,
      y2: PAGE_HEIGHT - y2,
      width,
      gray,
    });
  }

  rect({ x, y, width, height, gray = 0.92 }: {
    x: number;
    y: number;
    width: number;
    height: number;
    gray?: number;
  }): void {
    this.ops.push({ kind: "rect", x, y: PAGE_HEIGHT - y - height, width, height, gray });
  }

  /** Ancho aproximado de un texto, para centrar o alinear a la derecha. */
  static widthOf(value: string, size: number, font: PdfFont): number {
    // Aproximación por ancho medio de las fuentes base. Suficiente para alinear
    // a la derecha y centrar; no se usa para justificar, que sí exigiría las
    // métricas exactas de cada glifo.
    const factor = font === "Helvetica-Bold" ? 0.58 : 0.52;
    return value.length * size * factor;
  }

  toContentStream(): string {
    const partes: string[] = [];

    for (const op of this.ops) {
      if (op.kind === "rect") {
        partes.push(
          `${op.gray.toFixed(3)} g`,
          `${op.x} ${op.y} ${op.width} ${op.height} re f`,
        );
        continue;
      }

      if (op.kind === "line") {
        partes.push(
          `${op.gray.toFixed(3)} G`,
          `${op.width} w`,
          `${op.x1} ${op.y1} m ${op.x2} ${op.y2} l S`,
        );
        continue;
      }

      partes.push(
        "BT",
        `/${op.font === "Helvetica-Bold" ? "F2" : "F1"} ${op.size} Tf`,
        `${op.gray.toFixed(3)} g`,
        `${op.x} ${op.y} Td`,
        `(${escapePdfText(op.value)}) Tj`,
        "ET",
      );
    }

    return partes.join("\n");
  }
}

/**
 * Escapa un texto para un literal de cadena PDF.
 *
 * Los paréntesis y la barra invertida son sintaxis dentro de la cadena: sin
 * escaparlos, un motivo con paréntesis rompería el archivo entero. Los
 * caracteres fuera de Latin-1 se transliteran, porque las fuentes base no los
 * tienen y saldrían como basura.
 */
function escapePdfText(value: string): string {
  return [...value]
    .map((caracter) => {
      const codigo = caracter.charCodeAt(0);

      if (caracter === "(" || caracter === ")" || caracter === "\\") return `\\${caracter}`;
      if (codigo < 32) return " ";
      // WinAnsiEncoding cubre acentos, ñ y ü, que es todo lo que aparece aquí
      if (codigo <= 255) return codigo > 126 ? `\\${codigo.toString(8).padStart(3, "0")}` : caracter;

      return "?";
    })
    .join("");
}

/**
 * Ensambla el documento final.
 *
 * Un PDF es una lista de objetos numerados más una tabla que dice en qué byte
 * empieza cada uno. Esa tabla debe ser exacta: por eso los desplazamientos se
 * miden sobre los bytes ya codificados y no sobre la longitud de la cadena,
 * que con acentos no coinciden.
 */
export function renderPdf(page: PdfPage, title: string): Uint8Array {
  const content = page.toContentStream();
  const contentBytes = latin1Bytes(content);

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title (${escapePdfText(title)}) /Producer (Logic Metric) >>`,
  ];

  let cuerpo = "%PDF-1.4\n";
  const desplazamientos: number[] = [];

  objetos.forEach((objeto, indice) => {
    desplazamientos.push(latin1Bytes(cuerpo).length);
    cuerpo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });

  const inicioXref = latin1Bytes(cuerpo).length;

  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const desplazamiento of desplazamientos) {
    xref += `${String(desplazamiento).padStart(10, "0")} 00000 n \n`;
  }

  const cola =
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${objetos.length} 0 R >>\n` +
    `startxref\n${inicioXref}\n%%EOF\n`;

  return latin1Bytes(cuerpo + xref + cola);
}

/** Un byte por carácter: el contenido del PDF va en Latin-1, no en UTF-8. */
function latin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}
