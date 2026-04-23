# Chat Temporanea GDPR No Account

Mini app con React, Express e Socket.IO per inviare messaggi e file temporanei
senza registrazione e senza persistenza lato server.

## Funzionalita

- Chat in tempo reale con nickname temporaneo.
- Riservatezza in transito: il client cifra i payload Socket.IO con XOR prima
  dell'invio e il server li decifra prima della validazione e dell'inoltro.
- Identita gestita lato server: il client non puo scegliere o mostrare lo
  `pseudo_id` usato internamente dal socket.
- Allegati effimeri fino a 5 MB, inviati in memoria via Socket.IO e mai salvati
  su disco.
- Anteprima inline per immagini e GIF, link download per gli altri file.
- Badge notifiche su titolo e favicon quando la scheda non e attiva.
- Pulizia automatica lato client: vengono mantenuti solo gli ultimi 200
  messaggi per evitare sovraccarichi del browser.
- Pulsante `Esci` per scollegarsi e tornare alla schermata nickname.

## Avvio

Avvio rapido su Windows:

```powershell
.\start.bat
```

Lo script apre server e client in due terminali separati.

Apri due terminali dalla cartella `gdpr-app`.

Backend:

```powershell
npm.cmd --prefix server run dev
```

Frontend:

```powershell
npm.cmd --prefix client run dev -- --host 0.0.0.0
```

Poi visita `http://localhost:5173` dal computer che ospita l'app, oppure
`http://IP_DEL_COMPUTER:5173` dagli altri computer della stessa rete.

Dopo modifiche al backend, riavvia il server Node: Socket.IO non ricarica il
file `server/index.js` automaticamente.

## Payload chat

Il client prepara il payload applicativo con il contenuto del messaggio e
l'eventuale file:

```json
{
  "messaggio": "ciao",
  "file": {
    "name": "immagine.gif",
    "type": "image/gif",
    "size": 25804,
    "dataUrl": "data:image/gif;base64,..."
  }
}
```

Prima dell'invio sulla socket, il payload viene serializzato, cifrato con XOR e
incapsulato cosi:

```json
{
  "cipher": "base64-del-payload-xor"
}
```

Il nickname viene registrato con l'evento `user:join`. Da quel momento il server
associa nickname e identificativo al socket connesso e ignora eventuali identita
mandate nei payload dei messaggi.

### Art. 5, par. 1, lett. c - Minimizzazione del dato

I payload applicativi sono ridotti ai soli dati necessari per erogare il
servizio di chat:

- `user:join` contiene solo il nickname temporaneo necessario a mostrare
  l'utente nella sessione;
- `chat:message` contiene solo `messaggio` e `file`, senza nome reale, email,
  indirizzo o altri dati anagrafici;
- `user:leave` non invia alcun dato identificativo aggiuntivo, perche' il
  server puo' ricavare il distacco dal socket gia' associato alla sessione.

Il server scarta inoltre i campi superflui: lo `pseudo_id` non viene letto dai
payload client ma viene generato lato server a partire dalla connessione
Socket.IO, riducendo sia i dati trasmessi sia il rischio di spoofing.

## GDPR e limiti

Il backend non scrive messaggi o file su file, database, cache applicativa o
memoria storica. Ogni messaggio viene validato e inoltrato in tempo reale agli
altri client connessi.

### Art. 25 - Privacy by Design

L'applicazione e stata progettata per trattare il meno possibile fin dalla
struttura del codice:

- nessuna registrazione o account permanente: l'utente entra solo con un
  nickname temporaneo;
- minimizzazione dei dati: il server inoltra solo nickname, testo del
  messaggio, allegato e timestamp strettamente necessari alla sessione, mentre
  il client invia solo i campi indispensabili ai singoli eventi;
- identita controllata lato server: il client non puo imporre uno `pseudo_id`,
  che viene derivato dal socket e non esposto come dato modificabile;
- nessuna persistenza: messaggi e file non vengono scritti su database o disco;
- limitazione del trattamento: dimensione massima degli allegati, lunghezza
  massima dei messaggi e validazione dei payload prima dell'inoltro;
- riduzione dei dati lato client: l'interfaccia mantiene solo gli ultimi 200
  messaggi per non accumulare cronologia superflua nel browser.

Queste scelte collegano direttamente l'implementazione al principio di
protezione dei dati fin dalla progettazione e per impostazione predefinita:
l'app nasce con raccolta minima, durata minima e superficie di trattamento
ridotta, invece di aggiungere la privacy in un secondo momento.

### Art. 32 - Sicurezza del trattamento

Per rafforzare la riservatezza in transito, i dati applicativi passano sulla
socket in forma cifrata con XOR. Il client usa la chiave configurata in
`VITE_XOR_KEY` oppure la chiave di default `gdpr-xor-demo-key`; il server usa
la stessa chiave tramite `XOR_KEY` oppure la medesima chiave di default.

Gli allegati sono comunque contenuti nel payload Socket.IO mentre vengono
inoltrati. Per questo il limite e 5 MB per file e il client elimina dalla UI i
messaggi piu vecchi oltre la soglia di 200.

## Verifica

Build frontend:

```powershell
npm.cmd --prefix client run build
```

Lint frontend:

```powershell
npm.cmd --prefix client run lint
```

Syntax check backend:

```powershell
node --check server/index.js
```
