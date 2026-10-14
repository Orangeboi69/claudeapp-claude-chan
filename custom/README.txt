Xiaoke's custom folder
======================

Anything you put here is loaded when a session starts (or when she reloads).
Turn it all off with:  /xiaoke set customContent off
See what loaded with:  /xiaoke status

quotes.txt
  One line per quote. Lines starting with # are comments.
  Write "5|text" to give a line weight 5; plain lines weigh 3.
  Her built-in lines stay in the pool alongside yours.

portrait.png
  Replaces her picture. Square works best. At most 90,000 bytes
  (about 256x256 with 256 colors). Her crying face is not used
  while a custom portrait is set.

stickers/
  Extra stickers a poke may show, up to 40, loaded in name order.
  - name.png            a still sticker (at most 60,000 bytes)
  - name.gif / .webp    an animated sticker: split into frames once with
                        ffmpeg into .frames/ (keep it small, ~128 px and
                        up to 30 frames); it plays for about 2.4 s
  - name/ (a folder)    an animated sticker from its PNG frames, in name order;
                        a frame-ms.txt in it sets each frame's time (default 60)
  How often a poke shows one:  /xiaoke set stickerChance 25   (percent)
  Each sticker shows with a line beside it. Set your own in
  stickers/captions.txt, one per line:  petpet=……别摸了，头发会乱的。
  (name without or with its extension). Without one she says a default line.

Sounds: poke, turn-end, approve, ask, cost  (.wav or .mp3)
  e.g. ask.mp3 replaces the sound played when Claude asks you a question.
  Test one with:  /xiaoke sound ask
