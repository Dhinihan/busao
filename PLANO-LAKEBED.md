# Plano de migração · busão → Lakebed

> Este documento é **autocontido**: quem implementa deve conseguir executar tudo
> com ele + o repositório, sem contexto adicional. Não invente APIs: se algo não
> estiver aqui nem na doc oficial, gere uma capsule de referência com
> `npx lakebed@0.0.29 new` e confira no template gerado antes de prosseguir.

## 1. Contexto e objetivo

**busão** é um site minimalista para acompanhar em tempo real os ônibus de São
Paulo (API Olho Vivo / SPTrans). Hoje: servidor Hono/Node fazendo proxy para a
SPTrans + cliente React/Vite com Leaflet. Uso esperado: ~10 usuários × 3h/dia
(~11k requisições/dia, pico ~1 req/s agregado). A carga esperada é baixa, mas os
limites de deploy claimado não são publicados e o domínio público não impõe o teto
de 10 usuários.

Objetivo: distribuir como **capsule no Lakebed** (Ping Labs), em produção,
no domínio `busao.lakebed.app`.

Fontes oficiais (consultadas em 2026-08-22; reler antes de codar):

- https://docs.lakebed.dev/ (formato, deploy, limites)
- https://docs.lakebed.dev/reference/ (API de autoria + CLI)
- https://docs.lakebed.dev/capsule-api/ (exemplos server/client)
- https://docs.lakebed.dev/llms-full.txt (documentação pública consolidada)
- pacote npm oficial `lakebed` (tipos, template e regras efetivas do compilador)

Versão validada por este plano: **`lakebed@0.0.29`**. Usar essa versão em toda a
migração. Atualização do CLI é uma mudança separada: reler a documentação, gerar uma
capsule de referência e repetir os gates antes de trocar a versão.

## 2. Estado atual do repositório

```
server/index.ts        Hono: rotas /api/* + serveStatic de dist/ em produção
server/olhovivo.ts     Cliente SPTrans: sessão por cookie + validação de respostas
server/token-store.ts  Token em data/token.json (node:fs) ← não existe no Lakebed
server/demo.ts         Dados sintéticos p/ DEMO=1 ← morre
src/main.tsx           Entrada Vite (React)
src/App.tsx            Tela única: busca + mapa + favoritas
src/components/Mapa.tsx    Leaflet/react-leaflet (tiles OSM, marcadores, fitBounds)
src/components/Wizard.tsx  Assistente de cadastro do token ← morre
src/components/Estrela.tsx Botão de favoritar
src/hooks.ts           debounce busca, polling 10s, favoritas/rastreamento (localStorage)
src/api.ts             Cliente HTTP com validação de cada resposta
tests/*.test.ts        node:test sobre parsers e contrato
src/styles.css         CSS próprio ← não migra (Tailwind/estilos inline)
index.html             Shell/head do Vite ← substituído pelo shell fixo da capsule
```

Mecânica SPTrans relevante (em `server/olhovivo.ts`, preservar exatamente):

- Sessão: `POST https://api.olhovivo.sptrans.com.br/v2.1/Login/Autenticar?token=<token>`
  (corpo vazio). Corpo `"true"` + cookie retornado em `Set-Cookie`. Hoje o Node lê
  esse valor com `headers.getSetCookie()[0]`; a disponibilidade dessa API no runtime
  hospedado é gate explícito da Etapa 2.
- Cookie é reaproveitado. `401` e `403` invalidam a sessão. `404` só é tratado como
  sessão suspeita quando o cookie foi reaproveitado; `404` logo após autenticar é
  propagado como erro. O loop tem no máximo 2 tentativas e já é coberto por testes.
- Rotas upstream corretas:
  - `/Linha/Buscar?termosBusca=<termo>`;
  - `/Posicao/Linha?codigoLinha=<id>`.
- Toda resposta externa é validada campo a campo. Tipos, parsers e mensagens puras
  vão para `shared/`; o cliente SPTrans continua sem imports de Lakebed ou Node para
  permanecer testável com `node:test`.
- Contrato de erro preservado: JSON `{ "erro": string }` com HTTP **400**
  (validação de entrada), **502** (`ErroOlhoVivo`) e **500** (inesperado).
  O cliente novo DEVE consumir o mesmo contrato.

Rotas hoje → alvo na capsule:

| Hoje (Hono) | Alvo (endpoint da capsule) | Notas |
|---|---|---|
| `GET /api/status` | `GET /api/status` | Simplifica para `{ configurado: boolean }` |
| `POST /api/token` | — | Removido (token vem de env) |
| `DELETE /api/token` | — | Removido |
| `GET /api/linhas` | `GET /api/linhas` | Mesma query `?termo=` |
| `GET /api/posicoes/:id` | `GET /api/posicoes?linha=<id>` | Lakebed v0 não documenta parâmetros dinâmicos; + cache TTL (seção 5) |

## 3. A plataforma Lakebed — o essencial

Capsule = app full-stack TS com formato fixo:

```
server/index.ts        # default export capsule({ schema?, queries?, mutations?, endpoints })
client/index.tsx       # exporta function App() (Preact); componentes podem ser arquivos relativos
shared/                # TS PURO compartilhado (sem lakebed/*, DOM, Node, env)
.env.lakebed.server    # secrets server-only -> ctx.env   (gitignored, NUNCA commitado)
```

Restrições duras que dirigem o plano:

- **Sem npm arbitrário** dentro da capsule: nada de Hono, React, react-leaflet,
  Leaflet. Imports permitidos: relativos, `lakebed/server`, `lakebed/client`,
  módulos Preact providos pela plataforma (use o template `npx lakebed@0.0.29 new`
  como referência dos imports de hooks disponíveis).
- **Sem Node built-ins** nos módulos da capsule.
- Client: **sem CSS files nem shell HTML próprio**. `capsule({ name, favicon })`
  controla título/ícone; estilos usam Tailwind ou `style` no JSX. Fonte Doto cai fora
  por decisão de escopo, não por impossibilidade técnica.
- `shared/` deve permanecer **puro**: é o que permite rodar os testes node:test
  fora do runtime.
- `npx lakebed@0.0.29 dev` lê `.env.lakebed.server` localmente. No hospedado, o sync de
  env e outbound `fetch` exigem deploy pertencente a uma conta. Deploy anônimo
  desabilita outbound `fetch`; o prazo até parar de servir não é publicado e a
  exclusão definitiva ocorre cerca de uma semana depois.
- O sync de env hospedado **substitui** o conjunto remoto pelo conteúdo do arquivo
  local. Nunca deployar sem conferir que `.env.lakebed.server` existe e contém o
  token correto.
- `req.query` é `URLSearchParams`: usar `req.query.get("termo")`. Lakebed v0 não
  expõe `req.params` e o matcher atual usa caminho exato; não usar `:id` em endpoint.
- `useQuery`/`useMutation` do `lakebed/client` são para o DB da capsule. Os dados
  externos (SPTrans) ficam em **endpoints** HTTP; o cliente chama com `fetch`
  relativo e preserva o polling atual descrito na seção 5.
- Estado em escopo de módulo persiste no runtime local até rebuild, mas não há
  garantia publicada para o hospedado. Sessão e cache devem funcionar como estado
  descartável, nunca como requisito de correção.
- Autenticação e rate limit de aplicação: nenhum na primeira versão. Guest auth é
  padrão, mas não restringe acesso; os endpoints serão públicos. O gate hospedado
  deve responder se a cota do Lakebed comporta o uso normal sem limitar o usuário.

Esqueleto de referência do server (sintaxe final na doc oficial):

```ts
import { capsule, endpoint, json } from "lakebed/server";

export default capsule({
  endpoints: {
    status: endpoint({ method: "GET", path: "/api/status" }, async (ctx) =>
      json({ configurado: Boolean(ctx.env.OLHOVIVO_TOKEN?.trim()) })
    ),
    linhas: endpoint({ method: "GET", path: "/api/linhas" }, async (ctx, req) => {
      const termo = (req.query.get("termo") ?? "").trim();
      if (!termoValido(termo)) {
        return json({ erro: "digite ao menos 3 caracteres" }, { status: 400 });
      }
      // proxy SPTrans com ctx.env.OLHOVIVO_TOKEN, validação via shared/
    }),
  },
});
```

CLI usado no plano:

| Comando | Para quê |
|---|---|
| `npx lakebed@0.0.29 new <nome>` | Capsule de referência (descartável) |
| `npx lakebed@0.0.29 dev [--port]` | Rodar local (estado em memória, reseta a cada restart) |
| `npx lakebed@0.0.29 logs [--port]` ou `npx lakebed@0.0.29 logs <url>` | Logs do runtime — usar SEMPRE antes de adivinhar |
| `npx lakebed@0.0.29 auth login` / `npx lakebed@0.0.29 auth status` | Autenticar e confirmar a conta ANTES do primeiro deploy |
| `npx lakebed@0.0.29 deploy` | Publicar; autenticado antes do primeiro deploy, já deve criar deploy pertencente à conta |
| `npx lakebed@0.0.29 claim` | Adotar deploy anônimo, somente se a CLI indicar que ele não pertence à conta |
| `npx lakebed@0.0.29 domains add busao.lakebed.app` | Reservar subdomínio após o deploy pertencer à conta |
| `npx lakebed@0.0.29 inspect <url>` | Confirmar metadados e inspeção privada |
| `npx lakebed@0.0.29 token create --name <nome>` | Credencial de CI (opcional) |

## 4. Decisões registradas

| Tema | Decisão | Por quê |
|---|---|---|
| Token SPTrans | Só `.env.lakebed.server` (`OLHOVIVO_TOKEN`) lido por `ctx.env`; UI de troca morre | Token é fixo; env é server-only, nunca vai pro bundle |
| Wizard | Não migra | Idem |
| Modo demo (`DEMO=1`) | Morre; `demo.ts` não é portado | Produção não precisa |
| Favoritas | Continuam em `localStorage` | Funciona no Preact; DB+auth é trabalho futuro |
| Fonte Doto | Abandonada (pilha monospace) | Evita depender de injeção manual de fonte externa; não é necessária para o produto |
| Mapa | Slippy map próprio (tiles OSM + elementos posicionados) | Leaflet não pode ser importado |
| Cache posições | Em memória, TTL 7s, dedup de promise, estado descartável | Reduz rajadas concorrentes; correção e capacidade básica não dependem dele |
| Exposição | Endpoints públicos, sem login nem rate limit de aplicação na v1 | O objetivo é validar se o Lakebed suporta a carga prevista; se a cota da plataforma não comportar o uso normal, a migração é NO-GO |
| Paridade | Preservar polling, rastreamento e enquadramento atuais | Migração de plataforma não deve introduzir mudança silenciosa de produto |

## 5. Arquitetura alvo

```
server/index.ts          # wiring Lakebed: capsule() + 3 endpoints, sem schema
server/olhovivo.ts       # sessão e requests SPTrans; sem Lakebed, Node ou leitura de env
server/cache-posicoes.ts # cache best-effort com clock injetável
shared/                  # tipos, parsers, validadores, mensagens e tile-math puros
client/index.tsx         # App Preact: busca, mapa, favoritas, geolocalização
client/api.ts            # fetch relativo + validação do contrato da capsule
client/*.tsx             # componentes relativos ao entry
.env.lakebed.server      # OLHOVIVO_TOKEN=... (gitignored; obrigatório antes de deploy)
```

### Cache de posições (otimização obrigatória, estado descartável)

Motivação: polling do cliente é 10s e a SPTrans atualiza posições a ~10s. Sem
cache, cada poll de cada usuário vira uma chamada upstream. Com cache:

- `Map<linhaId, { dados, expiraEm }>` em memória de módulo, **TTL 7 s**. Um cliente
  sozinho consultando a cada 10 s encontra a entrada expirada; o ganho esperado é
  agrupar usuários e retomadas de aba que consultem a mesma linha dentro da janela.
- **Dedup de chamadas em voo**: se o TTL expirou e já existe fetch da linha em
  andamento, aguardar a mesma promise em vez de disparar outra.
- Erro NÃO é cacheado; o próximo request tenta de novo.
- Ao inserir, remover entradas expiradas para o `Map` não crescer com IDs antigos.
- Clock injetável (`agora: () => number`) para teste determinístico.
- Instrumentar com `ctx.log` (`hit`, `miss`, `relogin`) para medir o efeito real.
- Nenhuma regra de correção depende do cache. Se o runtime hospedado descartar estado
  entre requests, o sistema continua correto e a decisão de seguir depende do smoke
  e da carga medidos na Etapa 2.

### Cliente

- Portar `src/hooks.ts`, `App.tsx` e `Estrela.tsx`; trocar React por Preact e hooks
  de `preact/hooks`.
- Polling preservado: request imediato, timeout de 8 s com `AbortController`, próximo
  `setTimeout` de 10 s somente após a request terminar, pausa com aba oculta e refetch
  imediato no `visibilitychange` de volta.
- Em erro transitório, preservar as últimas posições e atualizar apenas a mensagem.
- Chaves mantidas: `busao:favoritas` e `busao:rastreamento`. Favoritas continuam
  sincronizando entre abas. Novo domínio implica perda das favoritas antigas, aceita.
- Geolocalização preservada: `watchPosition` contínuo, ativo por padrão salvo `off`,
  botão liga/desliga, marcador do usuário e centralização apenas uma vez por ativação.
- Estados de UI simplificados: sem Wizard/botão "configurar". `/api/status` responde
  apenas `{ configurado: boolean }`; tipos, validador e ramos de UI antigos de
  `demo`/`validado` são removidos. A mensagem específica de token recusado permanece.
- Mapa: componente da Etapa 1 usando `shared/tile-math.ts`; enquadrar veículos uma
  vez por linha selecionada, nunca a cada atualização de posições.
- Atribuição OpenStreetMap mantida visível no mapa.

---

## Etapa 0 · Linha de base + extração testável

Sem mudança de comportamento. Só preparação.

1. Registrar baseline verde: `npm test` e `npm run typecheck`.
2. Alterar o script `test` para executar `tests/*.test.ts`; os testes criados nas
   etapas seguintes não podem depender de uma lista fixa de arquivos.
3. Criar `shared/` com o que é puro hoje:
   - tipos `Linha`, `PosicaoVeiculo`, `PosicoesDaLinha`;
   - validadores e parsers de respostas Olho Vivo e da API interna;
   - `mensagemDeErro` e demais mensagens puras do cliente;
   - validadores de entrada: termo ≥ 3 caracteres e ID inteiro > 0.
4. `src/api.ts` e `server/olhovivo.ts` passam a importar esses contratos de `shared/`.
5. Refatorar `server/olhovivo.ts` para receber o token pelo chamador, sem importar
   `token-store.ts`, Hono, Lakebed ou Node. O Hono continua lendo o token atual e o
   passa ao cliente SPTrans, sem mudança de comportamento. Sessão, cookie e retry
   permanecem importáveis por `node:test` depois da troca do entrypoint.
6. Adicionar testes dos validadores de entrada. Hoje eles existem apenas nos handlers.
7. Com baseline e smoke verdes, criar `git tag pre-lakebed`. A partir da Etapa 2 o
   Hono deixa de ser o entrypoint; o rollback é pela tag, não por dois servidores
   coexistindo na árvore.

**Pronto quando:** suíte e typecheck verdes, comportamento idêntico e o script de
teste executa automaticamente qualquer novo `tests/*.test.ts`.
**Testes:** `parsers` passa a importar parsers/mensagens de `shared/`;
`requisicao` continua em `server/olhovivo.ts`; `api-cliente` ainda aponta para
`src/api.ts` e será reapontado na Etapa 3.
**Smoke:** `npm run dev` → buscar `8000`, abrir mapa, confirmar atualização e
rastreamento atuais.

## Etapa 1 · Protótipo do mapa dentro de uma capsule ⚠️ gate GO/NO-GO

Leaflet não pode ser importado. Validar a alternativa no ambiente que realmente será
usado, antes de migrar o servidor e o restante do cliente.

1. Gerar `scratch/` com
   `npx lakebed@0.0.29 new scratch --template todo --no-git`; manter `scratch/`
   fora do Git e apagar depois do gate.
2. Substituir o cliente do scratch por um slippy map mínimo:
   - tiles OSM `https://tile.openstreetmap.org/{z}/{x}/{y}.png` por zoom e offset;
   - pan por arrasto e zoom por botões;
   - ônibus fake como elementos posicionados, com círculo e tooltip;
   - marcador do usuário por `watchPosition` e botão liga/desliga;
   - enquadramento inicial dos veículos apenas uma vez por linha fake.
3. Implementar tudo com Preact, `preact/hooks`, Tailwind inline e estilos inline
   apenas para coordenadas dinâmicas. Não usar React, Leaflet nem CSS file.
4. Implementar a projeção primeiro em `scratch/shared/tile-math.ts`, importada pelo
   client do próprio scratch: lat/lng → pixel mundial → tile e offset, com funções
   puras. A capsule scratch não deve importar arquivos fora de sua raiz.
5. Criar `scratch/tests/tile-math.test.ts` e executá-lo diretamente com `node --test`.
6. Após o GO, copiar a implementação para `shared/tile-math.ts` e o teste para
   `tests/tile-math.test.ts`, ajustar o import e confirmar `npm test` verde. Na Etapa 2,
   ao copiar o client para a raiz, trocar o import para `../shared/tile-math.ts`.

**Pronto quando:** a capsule scratch roda em `npx lakebed@0.0.29 dev`; tiles e
marcadores permanecem alinhados ao arrastar e dar zoom; geolocalização funciona em
localhost; o mapa é usável em 375px.
**Testes:** o teste do scratch e depois `tests/tile-math.test.ts` cobrem projeção
redonda, tiles visíveis nas bordas e zoom 0.
**Smoke:** posições fake animadas, screenshots desktop e mobile, e confirmação de
que atualizações não reposicionam a câmera após o primeiro enquadramento.
**Decisão:** inviável ou ruim ⇒ PARAR e reavaliar a distribuição.

## Etapa 2 · Capsule server + spike hospedado ⚠️ gate GO/NO-GO

O `server/index.ts` Hono é substituído pelo entrypoint Lakebed. A tag da Etapa 0 é o
rollback. Copiar temporariamente o cliente do mapa aprovado no scratch para
`client/index.tsx`, dando à capsule um client válido e permitindo o smoke hospedado
de tiles/geolocalização.

1. Criar `server/index.ts` com `capsule()` e sem schema.
2. Manter `server/olhovivo.ts` desacoplado do Lakebed conforme a Etapa 0:
   - token recebido pelo chamador, não lido de env nem de token-store;
   - `fetch` e sinais de log/relogin injetáveis ou encapsulados sem runtime específico;
   - sessão/cookie em memória descartável;
   - manter exatamente os casos 401, 403 e 404 já cobertos por testes.
3. Criar `server/cache-posicoes.ts` conforme a seção 5.
4. Implementar endpoints estáticos:
   - `GET /api/status`;
   - `GET /api/linhas?termo=<texto>`;
   - `GET /api/posicoes?linha=<id>`.
   Ler queries exclusivamente com `req.query.get(...)`.
5. `server/index.ts` lê `ctx.env.OLHOVIVO_TOKEN`, converte erros esperados em 502,
   valida entrada com `shared/` e devolve 500 genérico sem stack ao cliente.
6. Antes de voltar a exigir `npm run typecheck`, criar um tsconfig para os módulos
   independentes do runtime e apontar o script `typecheck` para ele: `shared/`,
   `server/olhovivo.ts`,
   `server/cache-posicoes.ts`, `src/api.ts` e `tests/`. Excluir `server/index.ts` e o
   client Preact, cujos tipos `lakebed/*`/`preact/*` não estão instalados no repo.
7. Adicionar explicitamente ao `.gitignore`, antes de qualquer execução na raiz:
   - `.env.lakebed.server`;
   - `.lakebed/`;
   - `scratch/`.
   Depois criar `.env.lakebed.server` com `OLHOVIVO_TOKEN`.
8. Logs mínimos:
   - `ctx.log.info("cache", { linhaId, resultado: "hit" | "miss" })`;
   - `ctx.log.info("olhovivo relogin")`;
   - nunca registrar token, cookie ou URL contendo token.

**Testes:** preservar `tests/requisicao.test.ts` e suas asserções de URL/retry;
adicionar testes dos validadores de entrada e
`tests/cache-positions.test.ts` para TTL, dedup, erro não-cacheado, limpeza de
expirados e clock injetado.

**Validação local:**
- `npm test` e `npm run typecheck`;
- iniciar `npx lakebed@0.0.29 dev` e manter o processo durante os curls;
- `curl 'http://localhost:3000/api/status'` → `{"configurado":true}`;
- `curl 'http://localhost:3000/api/linhas?termo=8000'` → array de linhas;
- `termo=a` → 400;
- `curl 'http://localhost:3000/api/posicoes?linha=0'` → 400;
- ID real → posições válidas;
- dois curls imediatos da mesma linha → `miss` + `hit` nos logs;
- request depois de 7 s → novo `miss`;
- `npx lakebed@0.0.29 logs --port 3000` sem stack nem segredo.

### Spike hospedado obrigatório

Executar antes de portar o cliente completo:

1. `npx lakebed@0.0.29 auth login` e `npx lakebed@0.0.29 auth status` antes do primeiro deploy.
2. Conferir novamente `.env.lakebed.server`; o sync hospedado substitui o env remoto.
3. `npx lakebed@0.0.29 deploy` sem `--public-inspect`.
4. Se a CLI indicar deploy anônimo, executar `npx lakebed@0.0.29 claim` e
   `npx lakebed@0.0.29 deploy` novamente. Não repetir claim quando o primeiro deploy
   já pertencer à conta.
5. Registrar os limites impressos pelo deploy, em especial `requestsPerDay`.
   Projetar o consumo diário completo com 10 usuários × 3 h, incluindo polling,
   buscas, status e carregamentos do app. A pergunta é se o Lakebed suporta esse uso,
   não como limitar o usuário. Se a cota confirmada não superar a projeção normal,
   marcar a migração como NO-GO e reavaliar a plataforma; não introduzir rate limit,
   login obrigatório, throttling ou mudança de polling automaticamente.
6. Commitar `lakebed.json`, que contém apenas o `deployId`.
7. No URL gerado, confirmar:
   - outbound `fetch` e `ctx.env` funcionam;
   - o login SPTrans consegue ler `Set-Cookie`. Testar `getSetCookie()` e, se
     necessário, `headers.get("set-cookie")`; se nenhum funcionar, PARAR;
   - uma busca e uma consulta de posições funcionam;
   - tiles OSM e geolocalização funcionam no client da capsule;
   - inspeção permanece privada;
   - estado de sessão/cache entre requests é observado via logs.
8. Repetir polling representativo de 10 usuários. Se não houver persistência de
   estado, seguir somente se re-login por request continuar funcional, sem recusas da
   SPTrans e com latência aceitável no smoke. Registrar o resultado no plano.

**Pronto quando:** local e hospedado passam. Falha de env, outbound fetch, cookie,
tiles ou geolocalização é NO-GO. Cota diária que não comporte a projeção normal
também é NO-GO. Estado global ausente é degradação aceita somente após o teste
representativo.

## Etapa 3 · Cliente Preact

1. Portar para `client/` os hooks, `App.tsx`, `Estrela.tsx` e o mapa aprovado.
2. Usar hooks de `preact/hooks`; `client/index.tsx` exporta `App` sem props.
3. Mover `src/api.ts` para `client/api.ts`, manter fetch relativo e validação do
   contrato de erro, reapontar `tests/api-cliente.test.ts` e atualizar o tsconfig
   testável para o novo caminho.
4. Preservar os comportamentos registrados na seção 5: debounce, polling após a
   resposta, timeout, pausa em aba oculta, refresh ao voltar, últimas posições em
   erro, favoritas entre abas e rastreamento contínuo persistido.
5. Remover Wizard, modo demo e ramos `validado`/`demo` de status. Manter a mensagem
   específica de token recusado pela SPTrans.
6. Traduzir o layout para Tailwind inline, com altura explícita para o mapa em mobile.

**Pronto quando:** `npx lakebed@0.0.29 dev` compila a capsule e o app completo
funciona no runtime local.
**Testes:** `npm test` e `npm run typecheck` verdes contra `shared/`,
`server/olhovivo.ts`, cache e `client/api.ts`.
**Smoke obrigatório no navegador:**
- [ ] busca por número (`8000`) e nome (`Paulista`)
- [ ] termo < 3 caracteres não dispara request
- [ ] seleção de outra linha limpa o estado da anterior
- [ ] posições atualizam sem requests sobrepostos
- [ ] aba oculta pausa polling; voltar dispara refresh imediato
- [ ] falha transitória mostra erro e mantém os últimos ônibus
- [ ] enquadramento ocorre uma vez por linha, sem pular a cada atualização
- [ ] favorita sobrevive ao reload e sincroniza entre abas
- [ ] rastreamento liga/desliga, persiste e mostra marcador do usuário
- [ ] centralização do usuário ocorre uma vez por ativação
- [ ] permissão negada e navegador sem geolocalização mostram mensagem amigável
- [ ] layout usável em 375px, com mapa visível e atribuição OSM

## Etapa 4 · Deploy final e domínio

O deploy técnico já existe desde a Etapa 2. Esta etapa publica o cliente completo no
mesmo `deployId` e liga o domínio final.

1. Rodar `npm test` e `npm run typecheck`; iniciar `npx lakebed@0.0.29 dev` e
   repetir o smoke local antes de publicar.
2. Confirmar `npx lakebed@0.0.29 auth status`, o binding de `lakebed.json` e o conteúdo correto de
   `.env.lakebed.server`. Nunca deployar a partir de clone sem recriar esse arquivo.
3. `npx lakebed@0.0.29 deploy`, sem `--public-inspect`.
4. `npx lakebed@0.0.29 domains add busao.lakebed.app`. Se o nome estiver ocupado,
   PARAR e pedir ao dono outro subdomínio; não escolher um automaticamente.
5. `npx lakebed@0.0.29 inspect <url>` e `npx lakebed@0.0.29 logs <url>` para confirmar inspeção privada,
   env presente e ausência de erros.
6. Registrar uma linha de base de requests, misses de cache e relogins. Os endpoints
   são públicos e usam a credencial do dono. Não implementar rate limit de aplicação:
   a Etapa 2 já deve ter comprovado que a cota do Lakebed comporta o uso normal. Se o
   uso normal atingir a cota depois do lançamento, a premissa da migração falhou e o
   rollback é preferível a limitar o usuário silenciosamente.

**Pronto quando:** smoke completo passa em `busao.lakebed.app`.
**Smoke hospedado:** mesmos curls da Etapa 2; checklist da Etapa 3; logs sem segredo
ou stack; token ausente do bundle, manifest e inspeção pública; refresh após novo
deploy preserva env e funcionamento.

## Etapa 5 · Limpeza pós-verificação

Só depois do smoke hospedado passar.

1. Apagar o legado, sem tocar no novo `server/`:
   - `src/` inteiro;
   - `server/token-store.ts` e `server/demo.ts`;
   - `index.html`, `vite.config.ts`, `data/`, `dist/` e o scratch da Etapa 1.
2. `package.json`:
   - remover Hono, React, Leaflet, Vite, plugin React, concurrently e tipos órfãos;
   - manter `tsx`, `typescript` e `@types/node` para testes puros;
   - `test`: `node --test tests/*.test.ts`;
   - `typecheck`: manter o tsconfig de módulos testáveis criado na Etapa 2;
   - `dev`: `npx lakebed@0.0.29 dev`.
3. Atualizar o lockfile junto com `package.json`.
4. Confirmar que o tsconfig testável aponta para `client/api.ts`, não para
   `src/api.ts`. O restante de `client/` e `server/index.ts` é compilado pelo `dev` e
   validado novamente pelo deploy hospedado; `build --target anonymous` não é gate,
   pois rejeita por design capsules que usam outbound `fetch`.
5. Confirmar `lakebed.json` versionado, `.env.lakebed.server` ignorado e `.lakebed/`
   ignorado.
6. Reescrever `README.md`: versão do CLI, `dev`, testes, criação do env, cuidado com
   sync destrutivo, deploy e link deste plano.

**Pronto quando:** `npm test` e `npm run typecheck` verdes e
`npx lakebed@0.0.29 dev` inicia sem erro de compilação;
`rg -n -i '\b(leaflet|hono|wizard|token-store|react)\b' server client shared tests package.json`
retorna vazio; `src/` antigo e scratch não existem.
**Smoke:** clone fresco, recriar `.env.lakebed.server`, rodar dev e repetir o
checklist da Etapa 3. Não executar deploy no clone fresco antes de recriar o env.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `getSetCookie()` ou `Set-Cookie` indisponível no hospedado | Gate da Etapa 2; testar `getSetCookie()` e `headers.get("set-cookie")`; sem cookie legível, parar |
| Estado global de sessão/cache não persistir | Tratar como descartável; medir no hospedado; aceitar re-login por request só após teste representativo |
| Deploy apagar env hospedado | Conferir `.env.lakebed.server` antes de todo deploy; documentar que o sync substitui o conjunto remoto |
| Proxy público receber tráfego além da projeção | Sem rate limit na v1; monitorar. O gate cobre uso normal, não tráfego arbitrário; se a cota impedir o uso normal, rollback e reavaliação da plataforma |
| Chave SPTrans recém-criada demora dias para ativar | Só deployar com token ativo e validar busca/posição no spike hospedado |
| Mudança incompatível do Lakebed v0 | Fixar `lakebed@0.0.29`; atualizar apenas repetindo docs, template e gates |
| Limite diário menor que a carga normal projetada | Registrar `requestsPerDay` e projetar todas as requests do app; se não couber, Lakebed é NO-GO; cache reduz upstream, não inbound |
| Tiles OSM ou geolocalização bloqueados no hospedado | Testar dentro da capsule e no spike hospedado antes de portar o cliente completo |
| Sem SLA publicado | Aceito para este porte; tag `pre-lakebed` mantém rollback por código |

## Fora de escopo (não fazer nesta migração)

- Migrar favoritas para DB/auth da plataforma
- Sign-in com Google
- Pipeline de CI/CD (credencial de CLI existe se quiser depois)
- Modo demonstração
