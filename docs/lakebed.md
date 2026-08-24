# Notas do Lakebed

Comportamento e limites da plataforma (`lakebed@0.0.29`) aprendidos durante a
migração. O dia a dia (dev, testes, deploy, token) está no README; aqui é o que
o código não conta. Válido enquanto a versão não mudar.

## Comportamento do runtime hospedado

- `headers.getSetCookie()` não existe no hospedado. O login SPTrans lê o cookie
  por `headers.get("set-cookie")` — fallback implementado em
  `server/olhovivo.ts`; sem ele a sessão não funciona.
- Estado em escopo de módulo não persiste entre requests no hospedado: sem a
  sessão persistida no DB, cada request relogava na SPTrans (~1,3–2,1 s por
  request). Sessão e cache são sempre descartáveis; nenhuma regra de correção
  pode depender deles.
- A transação do endpoint cobre o handler inteiro, incluindo o fetch upstream
  aguardado. Escritas no DB sob rajada concorrente serializam e estouram lock
  timeout (~3,4 s), virando 500 — motivo pelo qual o cache de posições é em
  memória por isolate, não no DB. O cliente tolera o 500: mantém as últimas
  posições e repete em 10 s.
- Logs de aplicação (`ctx.log`) não aparecem em `lakebed logs` no hospedado;
  observação de comportamento é por latência.
- Cota publicada: 10.000 requests/dia por deploy. A projeção de uso normal
  (10 usuários × 3 h, polling ~10 s + buscas + status) fica em ~10–11k — a cota
  é o gate de NO-GO da plataforma, não motivo para rate limit ou login. Cache
  reduz upstream, não inbound. Se o uso normal não couber, rollback é
  preferível a limitar o usuário silenciosamente.
- Toda escrita no DB (insert/update dentro de endpoint) conta na cota de
  **mutations** (1.000/dia) — mesmo em GET, mesmo sem nenhuma `mutation`
  definida na capsule. Em 23/08 essa cota estourou (1.143 escritas de sessão)
  e a plataforma passou a responder 429 para TODOS os requests, incluindo
  `/api/status` — o cliente interpretou isso como "servidor sem token"
  (banner falso) e "HTTP 429" nas posições. A sessão SPTrans é a única
  escrita do app; por isso ela só grava quando o valor muda
  (`server/estado-db.ts`) e loga cada escrita (`estado: sessao gravada`).
- Cookie `apiCredentials` da SPTrans (medido em 23/08/2026): vida útil de
  ~30 min **absolutos** (canário criado 23:17 UTC, morto 23:48 UTC com
  polling ativo a cada 2 min — não é idle); logins concorrentes com o mesmo
  token coexistem (um login não invalida o outro); cada login devolve cookie
  diferente. Com TTL de 30 min, o regime estável é ~2 escritas/hora de app
  aberto — folga grande contra 1.000/dia. O estouro veio da era
  pré-persistência (cada request relogava e escrevia).
- Em dev local o DB é efêmero por boot (cada `lakebed dev` começa sem
  sessão; reuso entre requests é só pela memória do processo). A reutilização
  de sessão via DB entre requests só existe no hospedado.
- A geometria do trajeto GeoSampa tem cache em memória por isolate por 5 min
  (até 64 linhas). Sem tempo limite no fetch upstream — o runtime hospedado não
  expõe timers ao código da capsule (`setTimeout` é barrado no deploy), mesmo
  padrão do cliente Olho Vivo. O cache não vai para o DB, desaparece no restart
  e não é requisito de correção.
- Em 24/08 a cota de mutations estourou de novo (1.007/1.000), um dia depois da
  correção da persistência de sessão. Causa: o cliente pollava todas as linhas
  em paralelo; quando o cookie de ~30 min morria, todos os requests da rajada
  liam o mesmo cookie morto e cada um relogava e gravava a própria sessão —
  N requests simultâneos viram N escritas (o DB fica com a última sessão; as
  outras cookies morrem sem uso, mas as escritas já contaram — logins
  concorrentes coexistem, um não invalida o outro). Correção: poll sequencial
  round-robin no cliente (≤ 1 request em voo por dispositivo), que tampa a
  escrita em ~1 por morte de cookie. Lição: no hospedado, o multiplicador de
  mutations é a concorrência de requests, não a frequência — qualquer caminho
  que escreva no DB precisa ser à prova de rajada.

## Restrições da capsule (v0.0.29)

- O store de fontes lê o diretório com `readdir({withFileTypes:true})` e pula
  o que não é `isFile()`: `.env.lakebed.server` precisa ser arquivo **regular**
  — symlink é silenciosamente ignorado, o servidor sobe sem token e
  `/api/status` responde `configurado:false`. Por isso o `busao-env` copia em
  vez de linkar.

- Sem npm arbitrário nem Node built-ins na capsule. Imports permitidos:
  relativos, `lakebed/server`, `lakebed/client` e os módulos Preact providos
  pela plataforma.
- Client sem arquivo CSS nem shell HTML próprio: estilos em Tailwind inline ou
  `style` no JSX; `capsule({ name, favicon })` controla título e ícone.
- `req.query` é `URLSearchParams`; não existe `req.params` e o matcher usa
  caminho exato — parâmetro dinâmico vira query (`/api/posicoes?linha=<id>`).
- `shared/` precisa permanecer TS puro (sem `lakebed/*`, DOM, Node, env): é o
  que permite rodar os testes node:test fora do runtime.
- `useQuery`/`useMutation` são para o DB da capsule; dados externos ficam em
  endpoints HTTP chamados com `fetch` relativo.

## Upgrade e rollback

- Versão fixada em `lakebed@0.0.29`. Atualizar o CLI é mudança separada: reler
  a documentação, gerar uma capsule de referência com
  `npx lakebed@<nova> new` e repetir os gates (cookie, estado, cota) antes de
  trocar.
- Rollback da migração: tag `pre-lakebed` (pilha anterior Node/Hono/React/
  Leaflet). O legado foi apagado da árvore; o rollback é pela tag, não por dois
  servidores coexistindo.

## Limites do deploy (impressos pelo `deploy`)

- source/artifact: 1 MB · state: 1 MB · requests: 10.000/dia · mutations:
  1.000/dia · outbound fetch habilitado.
- O sync de env substitui o conjunto remoto pelo conteúdo de
  `.env.lakebed.server`: conferir o arquivo antes de todo deploy, e recriá-lo
  antes de deployar de um clone fresco.
