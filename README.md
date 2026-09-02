# busão · SP

Site minimalista para acompanhar em tempo real onde estão os ônibus das linhas da cidade de São Paulo.

- Busca de linhas por **número** (`8000`, `N106`) ou **nome** (`Paulista`)
- Posições dos ônibus em **mapa ao vivo** (atualização a cada 10 s)
- **Pontos de ônibus** como ícones discretos a partir do zoom 15: ao tocar,
  painel com as linhas que passam e previsão de chegada — hoje só para os
  pontos de corredor (limitação da API da SPTrans)
- Trajeto completo da linha desenhado pela geometria oficial do GeoSampa
- Círculo do ônibus na **cor oficial da linha** (GTFS da SPTrans, gerado em
  `shared/cores.ts`); sem cor no feed, cai na paleta da área operacional de
  origem (primeiro dígito do letreiro; nas noturnas, o dígito após o `N`)
- **Favoritas** salvas no navegador (localStorage)
- Rastreamento da posição do usuário (`watchPosition`, persistido)

No ar em **https://busao.lakebed.app**, como capsule
[Lakebed](https://lakebed.app). Os dados vêm da [API Olho Vivo
(SPTrans)](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/)
através dos endpoints server-side da própria capsule (a API não permite chamadas
diretas do navegador). Toda resposta externa é validada no servidor e no cliente
antes de uso.

## Como rodar

```sh
npm install
npx lakebed@0.0.29 dev --port 3000   # capsule completa em http://localhost:3000
npm test                             # suíte node:test
npm run typecheck                    # tsc estrito dos módulos testáveis
```

Requisito: CLI do Lakebed via `npx` (testado com `lakebed@0.0.29`).

### Token da SPTrans

Crie uma conta em
[sptrans.com.br/desenvolvedores](https://www.sptrans.com.br/desenvolvedores/cadastro-desenvolvedores/),
gere um token em “Meus Aplicativos” e coloque-o no env server-only da capsule:

```sh
echo 'OLHOVIVO_TOKEN=seu-token' > .env.lakebed.server   # 0600, fora do Git
chmod 600 .env.lakebed.server
```

Chaves recém-criadas podem levar alguns dias para ativar no servidor da SPTrans;
enquanto isso as buscas retornam a mensagem “a SPTrans ainda não ativou essa
chave”. O servidor faz login automaticamente e reutiliza a sessão (cookie)
persistida no banco da capsule; posições repetidas dentro de 7 s são servidas de
cache em memória. O login intermitentemente recusa o token em janelas curtas —
o pipeline de GTFS faz novas tentativas ao mapear paradas.

### Pontos de ônibus (GTFS offline)

O asset de paradas (`client/paradas-dados.ts`) e o quadro de horários são
gerados do GTFS de `gtfs/cittamobi_gtfs.zip`:

```sh
node gtfs/pipeline.ts                     # regenera asset + carga.sql
node gtfs/pipeline.ts --mapear-paradas    # + casa stop_id GTFS → cp Olho Vivo
```

O pareamento de `cp` (usado pela previsão de chegada) consulta a API por linha
e por corredor e casa por proximidade — a SPTrans só expõe previsão para
pontos de corredor, então só esses recebem `cp` no asset. Sem o arquivo
`gtfs/mapa-paradas.json` o app funciona: o painel mostra só as linhas do
ponto. O asset fica no bundle (a capsule não serve estáticos de `client/`).

### Worktrees (`git worktree`)

O arquivo fica fora do Git, então worktrees novos nascem sem token. Rode

```sh
./busao-env
```

para copiar o `.env.lakebed.server` do checkout principal antes de subir o
servidor (symlink não serve: o lakebed ignora arquivos que não são regulares —
ver `docs/lakebed.md`).

## Deploy

```sh
npx lakebed@0.0.29 auth login        # uma vez
npx lakebed@0.0.29 deploy            # publica client/ + shared/ + server/index.ts
npx lakebed@0.0.29 inspect <deployId>
npx lakebed@0.0.29 domains add busao.lakebed.app
```

O deploy sincroniza o env com `.env.lakebed.server` — recriar o arquivo antes de
deployar a partir de um clone fresco, senão o deploy sobe sem token.

## Estrutura

```
client/           app Preact: busca, favoritas, polling, mapa slippy próprio
shared/           tipos, parsers e validadores usados por servidor e cliente
server/index.ts   capsule Lakebed: endpoints /api/status|linhas|posicoes|rota,
                  sessão SPTrans no banco, cache de posições e rotas em memória
server/olhovivo.ts    cliente Olho Vivo (login por cookie, hooks de sessão)
server/geosampa.ts    cliente da geometria oficial das linhas
tests/            node:test do contrato SPTrans, cache, tile-math e api cliente
docs/lakebed.md   restrições, limites e comportamento do runtime Lakebed
```

O mapa é renderizado sem bibliotecas (tiles OSM + matemática própria em
`shared/tile-math.ts`). Sem CSS externo: layout em Tailwind inline.
