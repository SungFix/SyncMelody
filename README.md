# SyncMelody 🎶

Jogo musical cooperativo no navegador para **1 a 4 pessoas**. Cada participante controla um instrumento distinto — teclado, baixo, synth ou bateria — pressionando **D, F, J, K** (ou tocando na tela). Tem três músicas originais e um modo solo com instrumentos automáticos.

## Jogar online (sem instalar nada)

Acesse o site do projeto no GitHub Pages:

**https://sungfix.github.io/SyncMelody/**

> O site só estará acessível depois de ativar o GitHub Pages uma vez: abra **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main → / (root) → Save**. A publicação pode levar alguns minutos.

### Montar uma banda

1. Abra o site no navegador; selecione instrumento e música.
2. O primeiro jogador clica em **CRIAR SALA** e copia o link de convite.
3. Até três amigos abrem o link ou informam o código da sala, em outros navegadores ou dispositivos.
4. O líder aperta **INICIAR APRESENTAÇÃO**. As notas são sincronizadas e cada pessoa toca sua própria parte.
5. Quem estiver sozinho pode usar **JOGAR SOZINHO**: as partes não ocupadas tocam automaticamente.

## Como funciona o multiplayer no GitHub Pages

O GitHub Pages hospeda apenas HTML/CSS/JavaScript. Para manter o multiplayer sem hospedar Node.js, a versão web utiliza **WebRTC DataChannels**, via **PeerJS** (`peerjs@1.5.5`), com sinalização gratuita do [PeerJS Cloud](https://peerjs.com/server/cloud). A máquina de quem cria a sala coordena a partida. Não há servidores nossos armazenando contas ou músicas.

**Limitações conhecidas:** todos precisam de internet, navegador com WebRTC e acesso ao serviço PeerJS Cloud; redes restritivas podem bloquear as conexões. O serviço gratuito é de terceiros e não há garantia de disponibilidade ou latência. Se o líder sair, a sala termina. As partidas não ficam salvas. Os sons são gerados pela Web Audio API, sem músicas comerciais. Os jogos mantêm a sincronização por troca de horários, mas a latência da internet pode afetar a audição dos outros instrumentos.

### Rodar localmente (opcional)

Para rodar o site estático, execute um servidor de arquivos, por exemplo:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000/`: as salas usam WebRTC. O modo solo também funciona.

O projeto preserva o servidor Node.js WebSocket da versão anterior para uso opcional em hospedagens com Node 18+. Com `npm start` ou o arquivo `INICIAR-SYNCBEAT.bat`, ele inicia em `http://localhost:3000/`, e as salas nesse endereço usam o servidor local em vez de PeerJS Cloud.

```bash
npm test
npm start
```

## Arquivos

- `index.html`, `style.css`, `app.js`, `music.js`: interface e jogo completo.
- `peer-transport.js`: coordenação de salas 1–4 jogadores sobre WebRTC.
- `server.js`, `ws-lite.js`: servidor WebSocket opcional para hospedagem Node.
- `test/`: testes de progressão, multiplayer Node e multiplayer WebRTC simulado.

Os sons e as três faixas inclusas são originais deste projeto.