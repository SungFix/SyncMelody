# SyncMelody — Rock Studio (Modo Livre)

**Jogo musical para 1 a 4 pessoas**, no navegador. Dois modos:

- **Partitura:** músicas originais em que cada jogador acompanha notas em pistas do seu instrumento.
- **Ensaio livre:** toque espontaneamente, sem notas predefinidas, sozinho ou em grupo. No solo, troque de instrumento sem sair da tela. No modo em grupo, cada instrumento é reservado para uma pessoa.

## Controles

| Instrumento | Teclas | Observação |
| --- | --- | --- |
| Guitarra | A S D J K L (6) | Cordas de guitarra elétrica; com distorção e acordes no modo partitura |
| Bateria | A S D F J K L ; (8) | Bumbo, caixa, chimbal fechado e aberto, dois tons e dois pratos |
| Baixo elétrico | A S D J K (5) | Cinco cordas, com afinação B E A D G |
| Contrabaixo acústico | A S J K (4) | Quatro cordas, afinação E A D G |

Os botões na tela funcionam com mouse e toque. Use o botão **Modo livre — testar instrumentos** na tela principal, ou **Iniciar ensaio livre em grupo** depois de criar uma sala.

## Sons reais e atribuição

O jogo usa **amostras de instrumentos gravados**, e não apenas osciladores sintéticos, provenientes de:

- **FluidR3 GM**, `distortion_guitar`, `electric_bass_pick` e `acoustic_bass`, distribuídas por **MIDI.js Soundfonts** (CC BY 3.0). Projeto: https://gleitz.github.io/midi-js-soundfonts/ ; licença: https://creativecommons.org/licenses/by/3.0/
- **ClueSurf Wavebase**, amostras de bateria gravadas (domínio público). Projeto: https://github.com/cluesurf/wavebase

Não são gravações completas de performances nem emulações de amplificadores profissionais. A guitarra é sampleada e o som é alterado de tom conforme necessário. A qualidade depende do banco de samples e da saída de áudio. Não há gravações de músicas comerciais.

Os arquivos de áudio são baixados durante a publicação pelo GitHub Actions; caso um deles não esteja disponível no site, o app tenta carregar da fonte indicada. O usuário precisa de conexão com a internet para carregar amostras não armazenadas em cache. O modo livre não depende de músicas com notas predefinidas.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` publica automaticamente a versão estática em `https://sungfix.github.io/SyncMelody/` (se o Pages estiver habilitado em GitHub Actions).

Salas online usam **WebRTC + PeerJS** (serviço público de sinalização). Como toda conexão entre navegadores, determinadas redes/firewalls podem impedir a comunicação. Não há servidor dedicado persistente; o líder hospeda a sala.

## Testar localmente

```bash
npm test
npm start
```

Acesse http://localhost:3000. O servidor local WebSocket inclui o suporte a salas e ensaio livre; o site publicado no Pages usa WebRTC.


## Sua música (mapa aproximado)

- A nova faixa **Rock do seu MP3 (5:40)** usa um mapa aproximado dos ataques rítmicos da gravação fornecida. A gravação não está embutida no repositório.
- Controles: **bateria D F J K** (4), **guitarra F J** (2), **baixo D F J K** (4), **contrabaixo D F J K** (4), também no modo livre.
- Antes de começar, **cada jogador seleciona a própria cópia** do MP3 original ou com voz atenuada no navegador. O arquivo não é enviado ao GitHub nem aos outros jogadores.
- A base do MP3 é agendada no Web Audio; a partitura é **estimada**, não uma transcrição perfeita nota a nota. O contrabaixo é uma linha tocável adicional, não um stem isolado da música.
- A versão com voz atenuada é uma **aproximação por atenuação do centro do estéreo**, que pode reduzir outros instrumentos centrais. Não é extração vocal por IA.
- Não publique gravações de terceiros sem os direitos necessários.