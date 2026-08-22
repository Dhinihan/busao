# busão · SP

Site minimalista para acompanhar em tempo real onde estão os ônibus das linhas da cidade de São Paulo.

- Busca de linhas por **número** (`8000`, `N106`) ou **nome** (`Paulista`)
- Posições dos ônibus em **mapa ao vivo** (atualização a cada 10 s)
- **Favoritas** salvas no navegador (localStorage)

Os dados vêm da [API Olho Vivo (SPTrans)](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/) através de um proxy próprio (a API não permite chamadas diretas do navegador).

## Como rodar

```sh
npm install
npm run dev
```

Abra `http://localhost:5173`. O servidor da API sobe junto na porta `8787` e o Vite encaminha `/api` para ele.

### Token da SPTrans

No primeiro acesso o site abre um **assistente** que guia pelos 3 passos do cadastro de desenvolvedores:

1. Criar conta em [sptrans.com.br/desenvolvedores](https://www.sptrans.com.br/desenvolvedores/cadastro-desenvolvedores/) e confirmar pelo e-mail
2. No perfil, criar um aplicativo em “Meus Aplicativos” ([perfil](https://www.sptrans.com.br/desenvolvedores/perfil-desenvolvedor/))
3. Colar o token gerado — ele é validado na hora e salvo em `data/token.json`

Alternativa por variável de ambiente: `OLHOVIVO_TOKEN=seu-token npm run dev`.

### Modo demonstração

Sem token, dá para explorar a interface com dados sintéticos:

```sh
DEMO=1 npm run dev
```

## Produção

```sh
npm run build
npm start          # servidor único na porta 8787 servindo o front (dist/)
```

Use `PORT=8080 npm start` para trocar a porta.

## Estrutura

```
server/          proxy Hono → API Olho Vivo (+ sessão por cookie e modo demo)
src/components   Wizard (configuração do token), Mapa (Leaflet), Estrela
src/hooks.ts     debounce da busca, favoritas (localStorage), polling de posições
src/api.ts       cliente HTTP com validação das respostas
```
