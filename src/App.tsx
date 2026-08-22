import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "./api";
import { Estrela } from "./components/Estrela";
import { Mapa } from "./components/Mapa";
import { Wizard } from "./components/Wizard";
import { useFavoritas, usePosicoes, useValorPostergado } from "./hooks";
import type { Linha, StatusApi } from "./types";

export function App() {
  const [status, setStatus] = useState<StatusApi | null>(null);
  const [wizardDispensado, setWizardDispensado] = useState(false);
  const [wizardAbertoManualmente, setWizardAbertoManualmente] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<readonly Linha[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [linhaAtiva, setLinhaAtiva] = useState<Linha | null>(null);

  const estadoPosicoes = usePosicoes(linhaAtiva?.id ?? null);
  const { favoritas, alternar, tem } = useFavoritas();
  const termoPostergado = useValorPostergado(termoBusca.trim(), 350);

  const conectado = status !== null && (status.configurado || status.demo);
  const wizardAberto =
    status !== null && !status.configurado && !status.demo && !wizardDispensado;
  const mostrarWizard = wizardAberto || wizardAbertoManualmente;
  const chavePendente =
    status !== null && status.configurado && !status.demo && !status.validado;

  const recarregarStatus = useCallback(() => {
    api
      .status()
      .then(setStatus)
      .catch(() =>
        setStatus({ configurado: false, demo: false, validado: false }),
      );
  }, []);

  useEffect(() => {
    recarregarStatus();
  }, [recarregarStatus]);

  function fecharWizard(): void {
    setWizardAbertoManualmente(false);
    setWizardDispensado(true);
    recarregarStatus();
  }

  useEffect(() => {
    if (!conectado || termoPostergado.length < 3) {
      setResultados(null);
      setErroBusca(null);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    api
      .buscarLinhas(termoPostergado)
      .then((linhas) => {
        if (!cancelado) {
          setResultados(linhas);
          setErroBusca(null);
        }
      })
      .catch((excecao: unknown) => {
        if (cancelado) return;
        setResultados([]);
        setErroBusca(
          excecao instanceof ErroApi
            ? excecao.message
            : "não foi possível buscar linhas",
        );
      })
      .finally(() => {
        if (!cancelado) setBuscando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [conectado, termoPostergado]);

  return (
    <div className="app">
      <aside className="painel">
        <header className="painel__topo">
          <span className="led led--marca">busão·sp</span>
          <div className="painel__acoes">
            {status?.demo === true && (
              <span className="selo-demo">modo demonstração</span>
            )}
            <button
              type="button"
              className="botao-link botao-link--pequeno"
              onClick={() => setWizardAbertoManualmente(true)}
            >
              configurar
            </button>
          </div>
        </header>

        {chavePendente && (
          <p className="aviso-pendente">
            <span className="pendente-dot" aria-hidden="true" />
            Chave salva — aguardando a SPTrans ativar. Tentamos reconectar
            automaticamente.{" "}
            <button
              type="button"
              className="botao-link"
              onClick={() => setWizardAbertoManualmente(true)}
            >
              trocar chave
            </button>
          </p>
        )}

        <div className="busca">
          <label className="rotulo" htmlFor="campo-busca">
            Buscar linha
          </label>
          <input
            id="campo-busca"
            className="busca__campo"
            type="search"
            placeholder="número ou nome · ex.: 8000 ou Paulista"
            autoComplete="off"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
          />
        </div>

        {favoritas.length > 0 && (
          <nav className="favoritas" aria-label="Linhas favoritas">
            <span className="rotulo">Favoritas</span>
            <ul className="favoritas__lista">
              {favoritas.map((f) => (
                <li key={f.id} className="favoritas__item">
                  <button
                    type="button"
                    className={
                      "led favorita" +
                      (linhaAtiva?.id === f.id ? " favorita--ativa" : "")
                    }
                    onClick={() => setLinhaAtiva(f)}
                  >
                    {f.letreiro}
                  </button>
                  <button
                    type="button"
                    className="estrela estrela--cheia"
                    aria-label={`Remover ${f.letreiro} das favoritas`}
                    onClick={() => alternar(f)}
                  >
                    <Estrela cheia />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {linhaAtiva !== null && (
          <section className="ativa" aria-label="Linha selecionada">
            <div className="ativa__topo">
              <span className="led led--grande">{linhaAtiva.letreiro}</span>
              <button
                type="button"
                className={"estrela" + (tem(linhaAtiva.id) ? " estrela--cheia" : "")}
                aria-pressed={tem(linhaAtiva.id)}
                aria-label={
                  tem(linhaAtiva.id)
                    ? `Remover ${linhaAtiva.letreiro} das favoritas`
                    : `Salvar ${linhaAtiva.letreiro} nas favoritas`
                }
                onClick={() => alternar(linhaAtiva)}
              >
                <Estrela cheia={tem(linhaAtiva.id)} />
              </button>
              <button
                type="button"
                className="fechar"
                aria-label="Fechar linha ativa"
                onClick={() => setLinhaAtiva(null)}
              >
                ×
              </button>
            </div>
            <p className="ativa__nome">{linhaAtiva.descricao}</p>
            <p className="ativa__status">
              {estadoPosicoes.erro !== null ? (
                <span className="ativa__erro">{estadoPosicoes.erro}</span>
              ) : estadoPosicoes.dados === null ? (
                "buscando ônibus…"
              ) : (
                <>
                  <span className="vivo" aria-hidden="true" />
                  ao vivo · {estadoPosicoes.dados.horario} ·{" "}
                  {estadoPosicoes.dados.veiculos.length}{" "}
                  {estadoPosicoes.dados.veiculos.length === 1
                    ? "ônibus"
                    : "ônibus"}
                </>
              )}
            </p>
          </section>
        )}

        <section className="resultados" aria-live="polite">
          {!conectado && status !== null ? (
            <p className="resultados__aviso">
              Configure o token da SPTrans para buscar linhas reais.{" "}
              <button
                type="button"
                className="botao-link"
                onClick={() => setWizardAbertoManualmente(true)}
              >
                Abrir configuração
              </button>
            </p>
          ) : (
            <>
              {resultados === null && conectado && (
                <p className="resultados__dica">
                  Busque pelo número ou nome da linha. Ex.:{" "}
                  <code>8000</code>, <code>N106</code> ou <code>Paulista</code>.
                </p>
              )}
              {buscando && (
                <p className="resultados__dica">buscando…</p>
              )}
              {erroBusca !== null && (
                <p className="resultados__erro">{erroBusca}</p>
              )}
              {resultados !== null &&
                !buscando &&
                resultados.length === 0 &&
                erroBusca === null && (
                  <p className="resultados__dica">
                    Nenhuma linha encontrada para “{termoPostergado}”.
                  </p>
                )}
              {resultados !== null && resultados.length > 0 && (
                <ul className="resultados__lista">
                  {resultados.map((l) => (
                    <li key={l.id} className="resultados__item">
                      <button
                        type="button"
                        className={
                          "resultado" +
                          (linhaAtiva?.id === l.id ? " resultado--ativa" : "")
                        }
                        onClick={() => setLinhaAtiva(l)}
                      >
                        <span className="resultado__letreiro">{l.letreiro}</span>
                        <span className="resultado__nome">{l.descricao}</span>
                      </button>
                      <button
                        type="button"
                        className={
                          "estrela" + (tem(l.id) ? " estrela--cheia" : "")
                        }
                        aria-pressed={tem(l.id)}
                        aria-label={
                          tem(l.id)
                            ? `Remover ${l.letreiro} das favoritas`
                            : `Salvar ${l.letreiro} nas favoritas`
                        }
                        onClick={() => alternar(l)}
                      >
                        <Estrela cheia={tem(l.id)} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </aside>

      <main className="principal">
        <Mapa linha={linhaAtiva} estado={estadoPosicoes} />
      </main>

      {mostrarWizard && (
        <Wizard
          aoConcluir={fecharWizard}
          aoDispensar={fecharWizard}
          passoInicial={status?.configurado === true ? 2 : 0}
        />
      )}
    </div>
  );
}
