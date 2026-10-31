# Pubblicare Linkora gratis su Cloudflare

Questa versione usa Cloudflare Workers, D1 e Workers AI nel piano gratuito. Nei limiti gratuiti attuali sono inclusi fino a 100.000 richieste Worker al giorno, 5 GB totali D1, 5 milioni di righe lette e 100.000 righe scritte al giorno, e 10.000 Neurons AI al giorno. Se superi i limiti giornalieri, il servizio può fermarsi fino al reset: non attivare un piano a pagamento.

Questa configurazione pubblica Linkora sull'indirizzo gratuito `workers.dev`. Non serve comprare un dominio né inserire un metodo di pagamento. L'indirizzo finale viene mostrato da Wrangler al termine della pubblicazione e avrà una forma simile a `https://linkora.<tuo-account>.workers.dev`.

## Prima pubblicazione

1. Crea un account Cloudflare gratuito, se non ne hai già uno.
2. Fai doppio clic su `Installa Linkora gratis.bat` e accedi a Cloudflare quando si apre il browser.
3. Quando richiesto, inserisci una password nuova per la dashboard. Il nome utente sarà `linkora`.
4. Alla fine copia l'indirizzo `workers.dev` che compare nella finestra.

Lo script crea il database D1 nell'area UE, prepara le tabelle e pubblica il Worker su `workers.dev`. Non richiede GitHub, Render, un dominio personalizzato o una carta.

## Uso

- Apri l'indirizzo `workers.dev` copiato al termine; quando richiesto, usa `linkora` e la password scelta.
- Dopo ogni link creato appare subito il QR code e il pulsante **Copia**.
- I link brevi e i QR useranno l'indirizzo `workers.dev` seguito da `/nome-descrittivo`.
- I nomi vengono suggeriti da Workers AI, analizzando l’indirizzo completo. Se la quota gratuita dell’AI è temporaneamente esaurita, il sistema ricava un nome dalle parole dell’URL.
- Link e conteggi dei clic sono salvati nel database D1.

Per aggiornare il sito in futuro, apri questa cartella in PowerShell, accedi con `npx wrangler login` ed esegui `npx wrangler deploy`.
