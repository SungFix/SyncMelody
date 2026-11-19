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


## Sua música: três faixas originais PREVIA (toque por acertos)

Na faixa **Rock do seu MP3** há **três gravações de aproximadamente 5:40**, usadas sem editar, refazer, substituir ou misturar:

| Instrumento jogável | Faixa usada | Teclas |
| --- | --- | --- |
| Guitarra | `musicqa-guitarra-PREVIA.mp3` | F J |
| Bateria | `musicqa-bateria-PREVIA.mp3` | D F J K |
| Baixo elétrico | `musicqa-baixo-PREVIA.mp3` | D F J K |
| Contrabaixo | a MESMA faixa do baixo (não foi entregue uma quarta gravação) | D F J K |

**Sem áudio automático:** as três faixas iniciam sincronizadas, mas completamente mudas. Um acerto no ritmo abre brevemente o volume do **instrumento correspondente**; uma nota errada ou não pressionada não libera som. Com vários acertos seguidos, a música pode soar mais contínua; sem acertos, ela fica muda. O áudio permanece na posição correta da gravação e nunca é substituído por amostras MIDI nesta faixa.

**Como usar no GitHub Pages:** baixe o pacote das três prévias, extraia, clique no campo **Carregar guitarra, bateria e baixo (3 MP3)** e selecione os três arquivos (juntos ou um por vez). Cada participante precisa importar suas próprias cópias; os arquivos não são transmitidos para o servidor. No ZIP completo, os arquivos estão também dentro de `stems/`, e podem ser carregados automaticamente caso você use `npm start` no computador.

A separação anterior foi feita **por filtragem de frequências**, não por uma IA dedicada. Por isso, alguns sons de outros instrumentos continuam presentes em cada gravação. Os mapas de notas também são estimados.

### Direitos autorais

O site público contém **apenas o código e a partitura**; os MP3s não são disponibilizados por padrão pelo GitHub Pages. Use apenas gravações que você pode copiar e compartilhar. O ZIP é entregue diretamente nesta conversa para uso pessoal.