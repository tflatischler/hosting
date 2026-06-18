# Lyrik-Schlacht 🚢

**Schiffe versenken × Deutsch-Quiz** – Ein browserbasiertes Multiplayer-Spiel zum Thema Lyrik.

## Spielprinzip

Zwei Spieler treten im klassischen "Schiffe versenken" gegeneinander an. Die Besonderheit: Treffer müssen durch das korrekte Beantworten von Quizfragen zum Thema Lyrik (Sonett, Ode, Volkslied, Haiku, Elegie) bestätigt werden.

## Spielen

1. **GitHub Pages:** Das Spiel ist unter `https://<username>.github.io/<repo-name>/` erreichbar.
2. Spieler 1 klickt "Spiel erstellen" und teilt den Code.
3. Spieler 2 gibt den Code ein und klickt "Beitreten".
4. Schiffe platzieren → Quiz-Duelle starten!

## Technik

- Reines HTML/CSS/JavaScript (kein Build-Schritt nötig)
- Multiplayer über [PeerJS](https://peerjs.com/) (P2P, kein eigener Server nötig)
- 30 Quizfragen zu lyrischen Textsorten in `js/questions.json`

## Lokales Testen

Einfach `index.html` mit einem lokalen Server öffnen:

```bash
npx serve .
```

Dann zwei Browser-Tabs öffnen.

## Projektteam

Maxi, Benji, Fabi, Joni & Tim – BG/BRG/BORG, Deutsch 2025/26
