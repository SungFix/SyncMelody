# SyncMelody 🎶

Jogo musical cooperativo para **1 a 4 pessoas** no navegador. Cada pessoa controla um instrumento diferente — teclado, baixo, sintetizador ou bateria — com as teclas **D, F, J, K** ou pelo toque na tela.

## Abrir o jogo

**https://sungfix.github.io/SyncMelody/**

O GitHub Pages precisa ser ativado **uma única vez** pelo proprietário do repositório:

1. Abra [Settings → Pages](https://github.com/SungFix/SyncMelody/settings/pages).
2. Em **Build and deployment**, escolha **Deploy from a branch**.
3. Selecione **main** e a pasta **/ (root)**.
4. Clique em **Save**. Aguarde o GitHub disponibilizar o site.

Depois de habilitado, o endereço acima abre o jogo diretamente, sem instalar programas.

## Jogar em equipe

1. Selecione um apelido, um instrumento e a música.
2. Clique em **Criar sala** e compartilhe o link.
3. Até três amigos entram pelo link ou código.
4. O líder clica em **Iniciar apresentação**.
5. Cada um toca as notas do seu instrumento no ritmo. Instrumentos sem jogadores ficam automáticos.

Também há **modo solo**, com acompanhamento automático.

## Multiplayer

Como o GitHub Pages hospeda apenas arquivos estáticos, as salas online utilizam **WebRTC** e **PeerJS Cloud** para sinalização. Quem cria a sala coordena a partida. Não é necessário servidor Node.js para o site publicado.

**Observações:** todos devem ter acesso à internet e usar um navegador com suporte a WebRTC. Algumas redes bloqueiam conexões diretas; o serviço gratuito de terceiros pode ter indisponibilidades ou latência. Se o líder sair, a sala é encerrada. O áudio é sintetizado no navegador e as três músicas são originais.

## Rodar localmente

Basta abrir os arquivos com um servidor estático, por exemplo:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000/`. O modo solo não depende do PeerJS Cloud.

## Arquivos do site

- `index.html`: página e interface
- `style.css`: visual responsivo
- `app.js`: jogabilidade, som e interface
- `music.js`: músicas e partituras
- `peer-transport.js`: conexão entre até quatro navegadores

O código-fonte local completo da versão anterior (com servidor Node opcional e testes) também está disponível no pacote de desenvolvimento entregue na conversa.
