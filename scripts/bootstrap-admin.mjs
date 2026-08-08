#!/usr/bin/env node
/**
 * §74 · Creación del PRIMER administrador.
 *
 * No hay ningún usuario preinstalado ni credencial escrita en el código. Este
 * script crea la primera cuenta con datos REALES que aporta el operador:
 *
 *   npm run bootstrap:admin -- \
 *     --rut 12.345.678-5 \
 *     --nombre "Nombre Apellido" \
 *     --cargo "Cargo real" \
 *     --terminal "Nombre real del terminal" \
 *     --password "..."
 *
 * Sólo funciona UNA vez: la función `bootstrap_administrator` falla si ya
 * existe cualquier perfil. A partir de ahí los usuarios se crean desde ACCESO.
 *
 * Usa la service role, así que debe ejecutarse en un entorno de confianza
 * (máquina del administrador o consola de despliegue), nunca en el navegador.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// -----------------------------------------------------------------------------
// Argumentos
// -----------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

// -----------------------------------------------------------------------------
// RUT — misma validación que la aplicación y la base de datos
// -----------------------------------------------------------------------------
function normalizeRut(value) {
  if (!value) return null;

  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 8 || clean.length > 9) return null;

  const body = clean.slice(0, -1);
  const checkDigit = clean.slice(-1);
  if (!/^[0-9]+$/.test(body)) return null;

  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  if (expected !== checkDigit) return null;

  return `${body}-${checkDigit.toLowerCase()}`;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// -----------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailDomain = process.env.AUTH_EMAIL_DOMAIN?.trim() || "usuarios.interno";

  if (!supabaseUrl || !serviceRoleKey) {
    fail(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n" +
        "  Defínalas en .env.local o expórtelas en el entorno antes de ejecutar.",
    );
  }

  const rl = createInterface({ input: stdin, output: stdout });

  async function ask(label, provided) {
    if (provided) return provided;
    const answer = await rl.question(`${label}: `);
    return answer.trim();
  }

  console.log("\n▸ Creación del primer administrador de Logic Metric\n");

  const rawRut = await ask("RUT (ej. 12.345.678-5)", args.rut);
  const rut = normalizeRut(rawRut);
  if (!rut) {
    rl.close();
    fail("El RUT ingresado no es válido (revise el dígito verificador).");
  }

  const fullName = await ask("Nombre completo", args.nombre);
  const jobTitle = await ask("Cargo", args.cargo);
  const terminalName = await ask("Nombre del terminal principal", args.terminal);
  const password = await ask("Contraseña (mínimo 8 caracteres)", args.password);

  rl.close();

  for (const [label, value] of [
    ["nombre", fullName],
    ["cargo", jobTitle],
    ["terminal", terminalName],
  ]) {
    if (!value) fail(`Debe indicar el ${label}.`);
  }

  if (!password || password.length < 8) {
    fail("La contraseña debe tener al menos 8 caracteres.");
  }

  // El usuario nunca ve este identificador: se deriva del RUT (§7)
  const email = `${rut}@${emailDomain}`;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("\n▸ Creando la credencial en Supabase Auth…");

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { rut },
  });

  if (authError || !created?.user) {
    fail(`No se pudo crear la credencial: ${authError?.message ?? "error desconocido"}`);
  }

  console.log("▸ Creando el perfil de administrador…");

  const { data, error } = await supabase.rpc("bootstrap_administrator", {
    p_user_id: created.user.id,
    p_rut: rut,
    p_full_name: fullName,
    p_job_title: jobTitle,
    p_terminal_name: terminalName,
  });

  if (error) {
    // Sin perfil la credencial no sirve para nada: se elimina
    await supabase.auth.admin.deleteUser(created.user.id);

    if (error.message.includes("BOOTSTRAP_ALREADY_DONE")) {
      fail(
        "Ya existen usuarios en la plataforma.\n" +
          "  Los nuevos administradores se crean desde la sección ACCESO.",
      );
    }

    fail(`No se pudo crear el administrador: ${error.message}`);
  }

  console.log("\n✅ Administrador creado correctamente\n");
  console.log(`   RUT       ${rut}`);
  console.log(`   Nombre    ${fullName}`);
  console.log(`   Cargo     ${jobTitle}`);
  console.log(`   Terminal  ${terminalName}`);
  console.log(`   Rol       Administrador (todos los permisos, acceso global)\n`);
  console.log("   Ingrese en /login con ese RUT y la contraseña definida.\n");

  if (process.env.DEBUG) console.log(data);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
