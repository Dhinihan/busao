import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ARQUIVO_TOKEN = resolve(process.cwd(), "data/token.json");

export async function lerToken(): Promise<string | null> {
  const doAmbiente = process.env["OLHOVIVO_TOKEN"];
  if (doAmbiente !== undefined && doAmbiente.trim() !== "") {
    return doAmbiente.trim();
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
      return bruto.token;
    }
    return null;
  } catch {
    return null;
  }
}

export async function salvarToken(token: string): Promise<void> {
  await mkdir(dirname(ARQUIVO_TOKEN), { recursive: true });
  await writeFile(ARQUIVO_TOKEN, `${JSON.stringify({ token }, null, 2)}\n`, "utf8");
}
