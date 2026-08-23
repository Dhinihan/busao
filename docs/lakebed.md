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

## Restrições da capsule (v0.0.29)

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
