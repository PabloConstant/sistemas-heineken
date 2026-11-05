# Sistemas da Fermentação · Heineken

Site único com os dois sistemas da empresa, hospedado no **GitHub Pages** (grátis, sem limite
de publicações e acessível pela rede da empresa):

| Endereço | Sistema |
|---|---|
| `https://pabloconstant.github.io/sistemas-heineken/` | Página inicial com os atalhos |
| `…/sistemas-heineken/ftr/` | Painel FTR |
| `…/sistemas-heineken/cip/` | Rastreabilidade de CIP |

Os dois sistemas usam **o mesmo projeto Supabase** (`krscjbdphymgzjteclif`). A migração não
copia nem altera dados: só muda onde as telas ficam hospedadas.

> Por que não Cloudflare Pages? A rede da empresa bloqueia todos os endereços `*.pages.dev`.

## Estrutura

```
docs/                     ← o que o GitHub Pages publica (pasta /docs do branch main)
  index.html              ← página inicial
  cip/                    ← CIP (sem funções de servidor: conversa direto com o Supabase)
  ftr/index.html          ← Painel FTR
supabase/
  functions/painel-publish/index.ts  ← Edge Function que publica os meses do FTR
  painel_publicadores.sql ← lista privada de quem pode publicar
  painel_ftr.sql          ← tabelas do FTR (já aplicado)
  cip_schema.sql          ← esquema do CIP (referência)
```

### Como o Painel FTR publica

- **Ler** (supervisor, sem login): direto do Supabase com a chave pública; o RLS só permite
  leitura de `painel_months` e `painel_current`.
- **Publicar** (só autorizados): o painel envia o mês para a Edge Function `painel-publish`,
  que confere o login no Supabase, consulta a tabela privada `painel_publicadores`, valida os
  dados (checksum, abas, período, lotes) e grava tudo de uma vez pela função SQL
  `painel_publish`. A chave secreta fica só dentro do Supabase.
- A função só aceita chamadas vindas de `https://pabloconstant.github.io`.

Autorizar ou remover publicadores: Supabase › SQL Editor (exemplos em
`supabase/painel_publicadores.sql`).

## Atualizações

Cada mudança no `main` deste repositório que toque a pasta `docs/` é publicada sozinha pelo
GitHub Pages em 1 a 2 minutos. Mudanças na Edge Function são implantadas no Supabase
separadamente.

## Bom saber

- **Histórico local do FTR:** o painel guarda no navegador as importações feitas naquele
  endereço. No endereço novo esse histórico local começa vazio, mas os meses **publicados**
  vêm do Supabase normalmente.
- **CIP:** daqui em diante, mudanças no CIP são feitas aqui (pasta `docs/cip`). O repositório
  `Sistema-de-Rastreabilidade-de-CIP` fica como histórico.
- **Repositório público:** o GitHub Pages grátis exige repositório público. Nada sensível
  fica no código: a chave do Supabase que aparece aqui é a pública (`sb_publishable_`), a
  mesma que qualquer navegador recebe ao abrir o site.
