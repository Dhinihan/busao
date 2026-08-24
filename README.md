# busão · SP

Site minimalista para acompanhar em tempo real onde estão os ônibus das linhas da cidade de São Paulo.

- Busca de linhas por **número** (`8000`, `N106`) ou **nome** (`Paulista`)
- Posições dos ônibus em **mapa ao vivo** (atualização a cada 10 s)
- Círculo do ônibus na **cor da área operacional** de origem da linha (primeiro
  dígito do letreiro; nas noturnas, o dígito após o `N`)
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
cache em memória.

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
server/index.ts   capsule Lakebed: endpoints /api/status|linhas|posicoes,
                  sessão SPTrans no banco, cache de posições em memória
server/olhovivo.ts    cliente Olho Vivo (login por cookie, hooks de sessão)
tests/            node:test do contrato SPTrans, cache, tile-math e api cliente
docs/lakebed.md   restrições, limites e comportamento do runtime Lakebed
```

O mapa é renderizado sem bibliotecas (tiles OSM + matemática própria em
`shared/tile-math.ts`). Sem CSS externo: layout em Tailwind inline.
