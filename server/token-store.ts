import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ARQUIVO_TOKEN = resolve(process.cwd(), "data/token.json");

export type EstadoToken = {
  readonly token: string | null;
  readonly validadoDesde: string | null;
};

export async function lerEstado(): Promise<EstadoToken> {
  const doAmbiente = process.env["OLHOVIVO_TOKEN"];
  if (doAmbiente !== undefined && doAmbiente.trim() !== "") {
    return { token: doAmbiente.trim(), validadoDesde: null };
  }
  try {
    const conteudo = await readFile(ARQUIVO_TOKEN, "utf8");
    const bruto: unknown = JSON.parse(conteudo);
    if (
      typeof bruto === "object" &&
      bruto !== null &&
      "token" in bruto &&
      typeof bruto.token === "string"
    ) {
      const validadoDesde =
        "validadoDesde" in bruto && typeof bruto.validadoDesde === "string"
          ? bruto.validadoDesde
          : null;
      return { token: bruto.token, validadoDesde };
    }
    return { token: null, validadoDesde: null };
  } catch {
    return { token: null, validadoDesde: null };
  }
}

export async function salvarToken(
  token: string,
  validadoDesde: string | null,
): Promise<void> {
  await mkdir(dirname(ARQUIVO_TOKEN), { recursive: true });
  const conteudo = JSON.stringify({ token, validadoDesde }, null, 2);
  await writeFile(`${ARQUIVO_TOKEN}`, `${conteudo}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function marcarValidadoSeAtual(token: string): Promise<void> {
  const estado = await lerEstado();
  if (estado.token !== token) return;
  await salvarToken(token, new Date().toISOString());
}

export async function apagarToken(): Promise<void> {
  await unlink(ARQUIVO_TOKEN).catch(() => {});
}
