# patria-sem-fronteiras

Ajudando patriotas a encontrarem sua terra sem deixar sua nação.

Landing page de alta conversão + backend minimalista de envio de e-mail (com o
Guia do Patriota Verde-e-Amarelo em PDF anexo). Deploy na Vercel.

## Estrutura

```
index.html            Landing page (HTML/CSS/JS puro, sem build)
styles.css            Tema verde-e-amarelo + animações
app.js                Contador regressivo, reveals, máscara de celular, envio do form
api/send-email.js     Serverless Function Node — recebe o lead e envia os e-mails
assets/               logo.png, consultor.jpg e o guia em PDF
```

## Como rodar local

1. `npm install`
2. Copie `.env.example` para `.env` e preencha os dados do SMTP:
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true` para porta 465)
   - `SMTP_USER`, `SMTP_PASS` (app password, se for Gmail)
   - `MAIL_TO` — e-mail que recebe os dados de cada lead
   - `SITE_ORIGIN` — URL final do site (usada no CORS)
3. `npm run dev` (usa o `vercel dev`; requer a CLI da Vercel: `npm i -g vercel`)

Sem credenciais de SMTP a landing abre normalmente, mas o envio do formulário
responde 500 ("Serviço de e-mail não configurado").

## Deploy na Vercel

1. Commit e push deste repositório.
2. Importe o projeto na Vercel — os arquivos estáticos e a function em `api/`
   são detectados automaticamente (zero config).
3. Configure as mesmas variáveis de ambiente do `.env` em
   Project → Settings → Environment Variables.
4. (Opcional) Aponte o domínio e atualize `SITE_ORIGIN`.

## Proteções do endpoint (`/api/send-email`)

- POST + JSON only, limite de ~2 KB de body (413 acima disso)
- Validação estrita de nome, e-mail, idade (18–99) e celular; campos extras rejeitados
- Honeypot invisível no formulário — bots recebem 200 falso e são descartados
- Rate limit por IP: intervalo mínimo de 2 s entre requisições e no máximo
  3 envios válidos por janela de 10 minutos (429 acima disso)
- Headers de segurança, CORS restrito a `SITE_ORIGIN`, sem stack traces expostos
- Saídas HTML dos e-mails com escape de todos os dados do usuário

**Nota:** o rate limit é em memória, por instância warm. É suficiente para o
volume esperado de uma landing; se o tráfego crescer muito, migre para um
rate limit distribuído (ex.: Upstash Redis).

## E-mails enviados a cada lead

1. **Interno** para `MAIL_TO`: dados do interessado em layout HTML + PDF anexo.
2. **Confirmação** para o lead: boas-vindas + guia em PDF anexo.

Os templates HTML ficam em `api/send-email.js` (`leadEmailHtml` e
`confirmationEmailHtml`) — edite livremente.

## Promoção

Os três planos (Paraguai R$ 697,90 / Portugal R$ 1.097,90 / EUA R$ 1.397,90)
exibem 22% de desconto com o preço cheio riscado. O contador regressivo encerra
em **31/12/2026, 23:59:59 (horário de Brasília)** — data fixa em `app.js`
(constante `PROMO_END`).
