# Sistemas da Fermentação · Heineken

Site único com os dois sistemas da empresa, hospedado no **Cloudflare Pages** (plano grátis,
sem limite de créditos):

| Endereço | Sistema | Origem |
|---|---|---|
| `/` | Página inicial com os atalhos | nova |
| `/ftr/` | Painel FTR | antigo site `ftrbeerproduction-d74c.netlify.app` |
| `/cip/` | Rastreabilidade de CIP | antigo site `sistema-cip-heineken.netlify.app` (repositório `Sistema-de-Rastreabilidade-de-CIP`) |

Os dois sistemas continuam usando **o mesmo projeto Supabase** (`krscjbdphymgzjteclif`).
Nenhum dado é copiado ou alterado na migração: só muda onde as telas ficam hospedadas.

## Estrutura

```
public/                  ← tudo que o navegador recebe (Build output directory)
  index.html             ← página inicial
  _headers               ← cabeçalhos (equivalente ao [[headers]] do netlify.toml)
  cip/                   ← CIP, idêntico ao public/ do repositório original
  ftr/index.html         ← Painel FTR (só mudaram as rotas /api e textos que citavam o Netlify)
functions/api/           ← funções do servidor (Cloudflare Pages Functions)
  painel-config.js       ← /api/painel-config  (antes /.netlify/functions/painel-config)
  painel-publish.js      ← /api/painel-publish (antes /.netlify/functions/painel-publish)
supabase/                ← SQL de referência (já aplicado; não precisa rodar de novo)
```

As funções do FTR têm a mesma lógica das versões do Netlify: login conferido no Supabase,
lista de e-mails autorizados, checksum, validação completa dos dados e gravação atômica pela
função SQL `painel_publish`. O CIP não usa funções: conversa direto com o Supabase.

## Publicar pelo navegador (sem baixar nada)

### 1. Criar o projeto no Cloudflare

1. Entre em <https://dash.cloudflare.com/sign-up> e crie a conta grátis.
2. Menu **Workers & Pages** › **Create** › aba **Pages** › **Connect to Git**.
3. Autorize o GitHub e escolha só o repositório **sistemas-heineken**.
4. Em **Set up builds and deployments**:
   - **Project name:** um nome curto, por exemplo `fermentacao-heineken`
     (vira `fermentacao-heineken.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** deixe vazio
   - **Build output directory:** `public`
5. Ainda nessa tela, abra **Environment variables (advanced)** e crie as variáveis abaixo.

### 2. Variáveis do Painel FTR

| Nome | Valor | Tipo |
|---|---|---|
| `SUPABASE_URL` | `https://krscjbdphymgzjteclif.supabase.co` | Text |
| `SUPABASE_PUBLISHABLE_KEY` | a chave `sb_publishable_…` do projeto | Text |
| `SUPABASE_SECRET_KEY` | a chave `sb_secret_…` do projeto | **Secret** (Encrypt) |
| `PUBLISHER_EMAILS` | os e-mails que podem publicar, separados por vírgula | Text |
| `ALLOWED_ORIGINS` | deixe **vazio** no primeiro deploy (veja o passo 4) | Text |

Os valores são os mesmos do Netlify, em **ftrbeerproduction-d74c › Project configuration ›
Environment variables**. Se o Netlify esconder a chave secreta, crie uma nova no Supabase:
**Project Settings › API Keys › Secret keys › New secret key**. Nunca coloque essa chave no
código, em mensagens ou em prints.

### 3. Publicar

Clique em **Save and Deploy**. Em cerca de 1 minuto o site fica no ar em
`https://<nome-do-projeto>.pages.dev`.

### 4. Conferir (homologação)

Enquanto ninguém recebe o link novo, este endereço funciona como homologação. Os sites do
Netlify continuam no ar, sem mudança.

1. Página inicial: abre e mostra os dois atalhos.
2. **/ftr/**: abre sem login e mostra o mês publicado atual (o mesmo que o supervisor vê hoje).
3. **/ftr/** › Administração: entre com o e-mail publicador e publique um mês de teste já
   existente; a mensagem deve confirmar a publicação.
4. **/cip/**: entre com a conta de operador e com a de administração; registros e histórico
   aparecem como antes.
5. Depois de conferir, preencha `ALLOWED_ORIGINS` com o endereço do site
   (ex.: `https://fermentacao-heineken.pages.dev`) em **Settings › Variables and Secrets** e
   faça **Retry deployment** no último deploy. Isso faz a publicação do FTR aceitar pedidos só
   vindos do site oficial.

### 5. Trocar os links

Só depois da conferência: envie o endereço novo ao supervisor e aos operadores. Os sites do
Netlify podem ficar no ar por um tempo como reserva; abrir o site não gasta créditos, só
publicar versão nova.

## Bom saber

- **Atualizações:** cada mudança que entra no `main` deste repositório é publicada sozinha no
  Cloudflare. O plano grátis permite 500 publicações por mês.
- **Histórico local do FTR:** o painel guarda no navegador as importações feitas naquele
  endereço. No endereço novo esse histórico local começa vazio, mas os meses **publicados**
  vêm do Supabase normalmente. Importações locais que nunca foram publicadas precisam ser
  importadas de novo (ou levadas pelo backup do próprio painel).
- **CIP:** daqui em diante, mudanças no CIP devem ser feitas neste repositório (pasta
  `public/cip`). O repositório `Sistema-de-Rastreabilidade-de-CIP` fica como histórico.
