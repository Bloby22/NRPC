# Netflix Discord RPC

> Zobrazuje co sleduješ na Netflixu přímo ve tvém Discord statusu.

![Discord Status](https://img.shields.io/badge/Discord-RPC-5865F2?style=flat&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v22+-339933?style=flat&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat)

---

## 📺 Ukázka
![Discord Status](https://cdn.discordapp.com/attachments/1306144131407675463/1472959313361244171/image.png?ex=69952082&is=6993cf02&hm=ce81277ae4c3b5f1769758cb2a82b154651fe49a99ef87dae0f09de667cb0352&)

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
git clone https://github.com/bloby22/NRPC.git
cd netflix-discord-rpc
```

### 2. Instalace závislostí

```bash
npm install
```

### 3. Spuštění serveru

```bash
node index.js
```

### 4. Chrome rozšíření

1. Otevři Chrome a jdi na `chrome://extensions/`
2. Zapni **Režim pro vývojáře**
3. Klikni na **Načíst rozbalené** a vyber složku `extension/`

---

## 🎬 Podporované formáty

| Typ | Příklad titulku | Discord stav |
|-----|----------------|--------------|
| Seriál | `Stranger Things: S04E09 - The Piggyback` | `S04E09 - The Piggyback` |
| Díl | `Squid Game: D01 Red Light, Green Light` | `Díl 01 - Red Light, Green Light` |
| Film | `Inception` | *(pouze název)* |

---

## 📦 Závislosti

```json
{
    "chalk": "^5.6.2",
    "dayjs": "^1.11.19",
    "discord-rpc": "^4.0.1",
    "dotenv": "^17.3.1",
    "esbuild": "^0.27.3",
    "express": "^5.2.1",
    "node-fetch": "^3.3.2",
    "webpack": "^5.105.2",
    "ws": "^8.19.0"
  }
```
