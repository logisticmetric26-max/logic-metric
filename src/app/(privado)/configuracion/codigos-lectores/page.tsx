import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/feedback";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { ReaderCodesManager } from "@/features/reader-codes/reader-codes-manager";
import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Codigos lectores" };

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  tipo?: string;
  estado?: string;
  pagina?: string;
}

export default async function CodigosLectoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.readerCodes.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("reader_codes")
    .select("*", { count: "planned" })
    .order("internal_number")
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const textPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${textPattern},reader_code.ilike.${textPattern},reader_type.ilike.${textPattern}`,
    );
  }

  if (params.tipo) query = query.eq("reader_type", params.tipo);
  if (params.estado === "activos") query = query.eq("active", true);
  if (params.estado === "inactivos") query = query.eq("active", false);

  const [{ data: rows, count, error }, { data: rawTypes, error: typeError }] = await Promise.all([
    query,
    supabase
      .from("reader_codes")
      .select("reader_type")
      .not("reader_type", "is", null)
      .order("reader_type"),
  ]);

  if (error || typeError) {
    reportError("readerCodesPage", error ?? typeError);
    return <ErrorState description="No fue posible obtener el listado de codigos lectores." />;
  }

  const typeOptions = [
    ...new Set(
      (rawTypes ?? [])
        .map((row) => row.reader_type)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const activeFilterCount = [params.q, params.tipo, params.estado].filter(Boolean).length;

  return (
    <ReaderCodesManager
      readerCodes={rows ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      typeOptions={typeOptions}
      canCreate={context.permissions.includes(PERMISSIONS.readerCodes.create)}
      canEdit={context.permissions.includes(PERMISSIONS.readerCodes.edit)}
      canDelete={context.permissions.includes(PERMISSIONS.readerCodes.delete)}
      activeFilterCount={activeFilterCount}
    />
  );
}
