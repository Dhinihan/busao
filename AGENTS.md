# busão · instruções para agentes

Comandos: `npm run dev`, `npm test`, `npm run typecheck` (detalhes no README).

## Worktree novo: ligar o env antes de subir o servidor

`.env.lakebed.server` está no `.gitignore`, então `git worktree` nunca o
materializa — sem ele `/api/status` responde `configurado:false` e as buscas
falham. Antes de rodar `npm run dev` em um worktree, ligue o env do checkout
principal:

```sh
./busao-env
```

O script copia o arquivo do checkout principal (primeiro caminho de
`git worktree list`). Tem que ser **cópia**, não symlink: o lakebed monta o
store de fontes com `readdir({withFileTypes:true})` e pula o que não é arquivo
regular — um symlink é silenciosamente ignorado e o servidor sobe sem token
(detalhes em `docs/lakebed.md`). O script é idempotente: em worktree já igual ao
principal, no checkout principal, ele não altera nada; se a cópia local
estiver desatualizada, ele atualiza.

Confirme com `curl localhost:<porta>/api/status` → `{"configurado":true}`.
