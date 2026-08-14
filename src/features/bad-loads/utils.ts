import type { CurrentUserContext } from "@/types/database.types";
import type { DispenserOption } from "@/features/bad-loads/types";

function normalizeTerminalToken(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function filterDispensersByTerminalAccess(
  dispensers: DispenserOption[],
  context: CurrentUserContext,
) {
  if (context.profile.has_global_access) return dispensers;

  const allowedCodes = new Set(
    context.terminals
      .map((terminal) => normalizeTerminalToken(terminal.code))
      .filter((value): value is string => Boolean(value)),
  );
  const allowedNames = new Set(
    context.terminals
      .map((terminal) => normalizeTerminalToken(terminal.name))
      .filter((value): value is string => Boolean(value)),
  );

  return dispensers.filter((dispenser) => {
    const terminalCode = normalizeTerminalToken(dispenser.terminal_code);
    const terminalName = normalizeTerminalToken(dispenser.terminal_name);

    return (
      (terminalCode ? allowedCodes.has(terminalCode) : false) ||
      (terminalName ? allowedNames.has(terminalName) : false)
    );
  });
}

export function formatDispenserOptionLabel(dispenser: Pick<DispenserOption, "code" | "terminal_code" | "terminal_name">) {
  const terminalLabel = dispenser.terminal_code || dispenser.terminal_name;
  return terminalLabel ? `${dispenser.code} | ${terminalLabel}` : dispenser.code;
}
