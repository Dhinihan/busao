# busão · SP

Site minimalista para acompanhar em tempo real onde estão os ônibus das linhas da cidade de São Paulo.

- Busca de linhas por **número** (`8000`, `N106`) ou **nome** (`Paulista`)
- Posições dos ônibus em **mapa ao vivo** (atualização a cada 10 s)
- **Favoritas** salvas no navegador (localStorage)

Os dados vêm da [API Olho Vivo (SPTrans)](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/) através de um proxy próprio (a API não permite chamadas diretas do navegador). Toda resposta externa é validada no servidor e no cliente antes de uso.

## Como rodar

```sh
npm install
npm run dev          # front na porta 5174, API na 8787 (ambos só em localhost)
npm test             # suíte node:test do contrato Olho Vivo
npm run typecheck    # tsc estrito
```

### Acesso externo (ex.: pelo celular)

Os serviços escutam apenas em `127.0.0.1`. Para alcançá-los fora da máquina,
use o túnel do Tailscale (autenticado pela sua tailnet):

```sh
tailscale serve --bg --https=443 http://127.0.0.1:5174
```

O site fica disponível em `https://<seu-host>.<tailnet>.ts.net`. Se o Vite
recusar o Host, informe-o em `ALLOWED_HOSTS` (separado por vírgulas).
Outras variáveis: `WEB_PORT` (padrão `5174`) e `PORT` (API, padrão `8787`).

### Token da SPTrans

No primeiro acesso o site abre um **assistente** que guia os 3 passos do
cadastro de desenvolvedores:

1. Criar conta em [sptrans.com.br/desenvolvedores](https://www.sptrans.com.br/desenvolvedores/cadastro-desenvolvedores/) e confirmar pelo e-mail
2. No perfil, criar um aplicativo em “Meus Aplicativos” ([perfil](https://www.sptrans.com.br/desenvolvedores/perfil-desenvolvedor/))
3. Colar o token gerado — ele é validado na hora e salvo em `data/token.json`
   (permissão `0600`, fora do Git)

O botão **configurar** reabre o assistente a qualquer momento para trocar ou
avaliar a chave; `DELETE /api/token` remove o arquivo.

**Chave pendente:** chaves recém-criadas no portal da SPTrans podem demorar
alguns dias para ativar no servidor da API (problema conhecido). O token é
salvo mesmo assim como *pendente* e cada requisição tenta autenticar de novo —
quando a chave liga, o site volta sozinho.

**Rotação:** se uma chave for exposta, crie outro aplicativo no portal e
substitua pela UI (“configurar” → passo 3).

Alternativa por variável de ambiente: `OLHOVIVO_TOKEN=seu-token npm run dev`.

### Modo demonstração

Sem token, dá para explorar a interface com dados sintéticos:

```sh
DEMO=1 npm run dev
```

## Produção

```sh
npm run build
npm start            # servidor único em 127.0.0.1:8787 servindo dist/
```

Aponte o `tailscale serve` para a porta da API nesse caso.

## Estrutura

```
server/          proxy Hono → API Olho Vivo (+ sessão por cookie e modo demo)
src/components   Wizard (configuração do token), Mapa (Leaflet), Estrela
src/hooks.ts     debounce da busca, favoritas (localStorage), polling de posições
src/api.ts       cliente HTTP que valida cada resposta antes de usar
tests/           node:test do contrato SPTrans e das mensagens de erro
```
