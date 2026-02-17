# Netflix Discord RPC

> Zobrazuje co sleduješ na Netflixu přímo ve tvém Discord statusu.

![Discord Status](https://img.shields.io/badge/Discord-RPC-5865F2?style=flat&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v22+-339933?style=flat&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)

---

## 📺 Ukázka

```
Sleduje Netflix
Stranger Things
S04E09 - The Piggyback         1:15:23 zbývá
```

---

## ⚙️ Jak to funguje

1. **Chrome rozšíření** (`content.js`) sleduje přehrávač Netflixu a odesílá data přes WebSocket
2. **Node.js server** přijímá data a předává je Discord RPC
3. **Discord** zobrazuje stav ve tvém profilu

```
Netflix (Chrome) → WebSocket → Node.js server → Discord RPC
```

---

## 🚀 Instalace

### Požadavky

- [Node.js](https://nodejs.org/) v22+
- Discord desktop aplikace
- Google Chrome

### 1. Klonování repozitáře

```bash
git clone https://github.com/tvuj-username/netflix-discord-rpc.git
cd netflix-discord-rpc
```

### 2. Instalace závislostí

```bash
npm install
```

### 3. Discord aplikace

1. Jdi na [Discord Developer Portal](https://discord.com/developers/applications)
2. Vytvoř novou aplikaci s názvem `Netflix`
3. Zkopíruj **Client ID**
4. Do sekce **Rich Presence → Art Assets** nahraj obrázek s názvem `netflix_logo`

### 4. Konfigurace

Otevři `index.js` a nastav své **Client ID**:

```js
const config = {
  client: 'TVOJE_CLIENT_ID'
};
```

### 5. Spuštění serveru

```bash
node index.js
```

### 6. Chrome rozšíření

1. Otevři Chrome a jdi na `chrome://extensions/`
2. Zapni **Režim pro vývojáře**
3. Klikni na **Načíst rozbalené** a vyber složku `extension/`

---

## 📁 Struktura projektu

```
netflix-discord-rpc/
├── index.js                 # Vstupní bod aplikace
├── RPC/
│   └── client.js            # Discord RPC klient
├── Services/
│   ├── netflix.js           # Handler pro Netflix data
│   ├── server.js            # HTTP server
│   └── websocket.js         # WebSocket server
├── Utils/
│   └── logger.js            # Logger
├── extension/
│   ├── manifest.json        # Chrome rozšíření manifest
│   ├── content.js           # Content script pro Netflix
│   └── extractor.js         # Extrakce metadat z přehrávače
└── logs/                    # Logy aplikace
```

---

## 🎬 Podporované formáty

| Typ | Příklad titulku | Discord stav |
|-----|----------------|--------------|
| Seriál | `Stranger Things: S04E09 - The Piggyback` | `S04E09 - The Piggyback` |
| Díl | `Squid Game: D01 Red Light, Green Light` | `Díl 01 - Red Light, Green Light` |
| Film | `Inception` | *(pouze název)* |

---

## 🛠️ API Endpointy

Server běží na portu `3000`, WebSocket na portu `3001`.

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| `GET` | `/ping` | Health check |
| `GET` | `/status` | Stav serveru a RPC |
| `POST` | `/update` | Aktualizace aktivity |
| `POST` | `/pause` | Pozastavení |
| `POST` | `/resume` | Obnovení |
| `POST` | `/stop` | Zastavení |
| `POST` | `/reset` | Reset |

---

## 📦 Závislosti

```json
{
  "discord-rpc": "^4.0.1",
  "express": "^4.18.2",
  "ws": "^8.14.2"
}
```

---

## 📄 Licence

MIT
