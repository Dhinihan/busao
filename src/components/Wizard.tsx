import { useState } from "react";
import { api, ErroApi } from "../api";

type Passo = "conta" | "aplicativo" | "token";

const PASSOS: readonly {
  readonly id: Passo;
  readonly titulo: string;
  readonly texto: string;
  readonly link?: { readonly url: string; readonly rotulo: string };
}[] = [
  {
    id: "conta",
    titulo: "Crie sua conta",
    texto:
      "Cadastre-se como desenvolvedor no site da SPTrans (pessoa física serve) e confirme o cadastro pelo link enviado ao seu e-mail.",
    link: {
      url: "https://www.sptrans.com.br/desenvolvedores/cadastro-desenvolvedores/",
      rotulo: "Abrir cadastro SPTrans",
    },
  },
  {
    id: "aplicativo",
    titulo: "Crie um aplicativo",
    texto:
      "Entre no seu perfil, abra “Meus Aplicativos” e adicione um aplicativo com qualquer nome. Um token de acesso será gerado.",
    link: {
      url: "https://www.sptrans.com.br/desenvolvedores/perfil-desenvolvedor/",
      rotulo: "Abrir Meus Aplicativos",
    },
  },
  {
    id: "token",
    titulo: "Cole o token",
    texto:
      "Copie o código gerado e cole abaixo. Ele fica salvo neste servidor e é validado na hora com a SPTrans.",
  },
];

export function Wizard(props: { aoConcluir: () => void; aoDispensar: () => void }) {
  const [indice, setIndice] = useState(0);
  const [token, setToken] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const passo = PASSOS[indice] as (typeof PASSOS)[number];

  async function conectar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const validado = await api.salvarToken(token.trim());
      if (validado) {
        props.aoConcluir();
      } else {
        setAviso(
          "Salvamos seu token, mas a SPTrans ainda não o aceitou. Chaves " +
            "recém-criadas no portal deles podem levar alguns dias para " +
            "ativar — é um problema conhecido e não depende de você. " +
            "Deixe salvo: o site reconecta sozinho assim que a chave ligar.",
        );
      }
    } catch (excecao) {
      setErro(
        excecao instanceof ErroApi
          ? excecao.message
          : "não foi possível validar o token agora",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="wizard__fundo">
      <div
        className="wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-titulo"
      >
        <span className="led">busão·sp</span>
        <h2 id="wizard-titulo" className="wizard__titulo">
          Conectar aos dados da SPTrans
        </h2>
        <p className="wizard__intro">
          As posições dos ônibus vêm da API Olho Vivo. O acesso é gratuito —
          leva uns 3 minutos.
        </p>

        <ol className="wizard__passos">
          {PASSOS.map((p, i) => (
            <li
              key={p.id}
              className="wizard__passo"
              data-atual={i === indice || undefined}
              data-feito={i < indice || undefined}
              aria-current={i === indice ? "step" : undefined}
            >
              <span className="wizard__passo-numero">{i + 1}</span>
              {p.titulo}
            </li>
          ))}
        </ol>

        <div className="wizard__conteudo">
          <h3>{passo.titulo}</h3>
          <p>{passo.texto}</p>

          {passo.link !== undefined && (
            <a
              className="botao botao--contorno"
              href={passo.link.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setIndice(indice + 1)}
            >
              {passo.link.rotulo} ↗
            </a>
          )}

          {passo.id === "token" && aviso === null && (
            <form className="wizard__form" onSubmit={(e) => void conectar(e)}>
              <label className="rotulo" htmlFor="campo-token">
                Token de acesso
              </label>
              <input
                id="campo-token"
                className="wizard__campo"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="cole aqui o código recebido por e-mail"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              {erro !== null && (
                <p className="wizard__erro" role="alert">
                  {erro}
                </p>
              )}
              <button
                type="submit"
                className="botao"
                disabled={enviando || token.trim().length === 0}
              >
                {enviando ? "Validando…" : "Salvar e conectar"}
              </button>
            </form>
          )}

          {aviso !== null && (
            <div className="wizard__aviso">
              <p>{aviso}</p>
              <button
                type="button"
                className="botao"
                onClick={props.aoConcluir}
              >
                Entendi
              </button>
            </div>
          )}
        </div>

        <footer className="wizard__rodape">
          <button
            type="button"
            className="botao-link"
            onClick={
              indice < PASSOS.length - 1
                ? () => setIndice(indice + 1)
                : props.aoDispensar
            }
          >
            {indice < PASSOS.length - 1
              ? "Já fiz este passo →"
              : "Configurar depois"}
          </button>
          {indice > 0 && (
            <button
              type="button"
              className="botao-link"
              onClick={() => setIndice(indice - 1)}
            >
              ← voltar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
