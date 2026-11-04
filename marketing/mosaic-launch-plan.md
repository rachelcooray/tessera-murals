# Tessera social plan · Commissioned hidden mosaics

Instagram, Facebook and TikTok. Three weeks to launch, then a weekly rhythm.

Goal for the first three weeks: **20 founding mosaic orders on a waiting list, and 50 artists signed up for the colour challenge.**
The account stays faceless. The mosaics are the face; you speak as voiceover only.

Placeholders in `{{double braces}}` need real facts before posting. Never fill them with guesses.
The 10,000 tile wedding mosaic on the site (`sample-dusk`) is a **sample**. Say so on screen whenever it appears.

---

## Read this first: what can and can't be sold today

The site works end to end in one browser, but orders, tiles and invite links are still stored in that browser (see README, Phase 2). A real customer's guests can't add tiles from their own phones yet, and card payments run in test mode until the `MOSAIC_TIERS` secret is set.

So until Phase 2 ships, every call to action points to a **waiting list for founding mosaics**, not to checkout. When orders work across devices, swap `{{waiting list link}}` for the `/start` link and change "Join the list" to "Start yours". Each post below notes the swap.

---

## The message

**One line:** Your photo, made from other people's art.

**The hook that sells it:** everyone paints one colour, and nobody sees the picture until the reveal.

Three angles, rotate them:

| Angle | Who it's for | The promise |
|---|---|---|
| **The gift** | Couples, families, friends, teams | A present made by everyone who loves them, revealed all at once |
| **The mystery** | Anyone scrolling | 10,000 squares painted blind. Watch what they made. |
| **The artists** | Illustrators, painters, students | Pick a colour, make a small piece, share 30% of the price |

Words to use: hidden, reveal, one colour, by hand, together, the last tile.
Words to avoid: AI, algorithm, pixel, NFT, viral, forever.

---

## Facts you can state

These come from the site's settings (`src/config/mosaic.ts`). If you change a setting, update the posts.

- Four sizes: Small, 10,000 tiles, $45 · Medium, 20,000 tiles, $95 · Large, 30,000 tiles, $145 · Grand, 40,000 tiles, $195
- Faces become recognisable from about 20,000 tiles
- Guests can paint as many squares as they like
- A print can be added at checkout
- Contributors never pay
- Tiles from guests and artists are made by hand. AI-made uploads are rejected, and a person reviews every tile. Say "hand-painted by your people and Tessera artists", never "every square is painted by a person"
- Each contributor sees one slot and one colour, never the picture
- Friends paint first. Open slots go to Tessera artists through the colour challenge
- Artists share 30% of the price between them, split by accepted tiles. The customer can favourite up to 5 tiles, and those count double
- Every mosaic finishes on time; Tessera artists pick up open squares
- Reveal date: 3 or 6 weeks out, or any date at least 7 days away
- The reveal zooms out from one tile to the whole picture and exports a 9:16 video
- Every contributor gets a link to their own tile

The prices are marked in the config as placeholders to test. If you change them before launch, change them here first.

---

## Profiles

**Handle:** `{{handle}}` on all three. Same name, same profile picture: the Tessera mark on the dark wall colour.

**Instagram bio**
> Your photo, made from other people's art.
> Everyone paints one colour. Nobody sees the picture until the reveal.
> Founding mosaics: join the list ↓

**TikTok bio** (80 characters)
> Your photo, painted blind by everyone you love. Reveal on the day.

**Facebook Page**
- Category: Art studio, or Gift shop
- Short description: Hidden mosaics made by people. Upload one photo. Everyone you invite paints one colour, by hand, without seeing the picture. On the day, it's revealed.
- Button: Sign up → `{{waiting list link}}`

**Link:** `{{waiting list link}}` until launch, then the site.

**Highlights (Instagram):** How it works · Reveals · Artists · Sizes · FAQ

---

## How to make each format

All footage comes from the live site. Nothing needs a camera.

**Reel or TikTok (1080×1920, 15 to 30 seconds)**
1. Record from the site on your phone with the screen recorder, or in a desktop browser sized to a tall window.
2. The best footage, in order:
   - `/reveal?id=sample-dusk`: the reveal animation. Press export to get the 9:16 video directly. This is your strongest clip.
   - Home page, the **What a contributor sees / The finished piece** switch. Toggle it slowly.
   - `/challenge`: the colour challenge grid.
   - `/start`: the order flow, upload to slot preview.
   - `/join` from a sample invite: getting a colour, then the tint slider.
3. Edit in CapCut or the Instagram editor. Hook text on screen from frame one. Captions always on; most people watch muted.
4. End card for 2 seconds: "Founding mosaics: link in bio".
5. Any shot of the sample gets a small "Sample mosaic" label in a corner.

**Carousel (1080×1350, Instagram and Facebook)**
Dark background (`#0e0b09`), headings in Instrument Serif, body in Geist, gold accent (`#c9a24f`). Same look as the site. One idea per slide, under 20 words.

**Story (1080×1920)**
Export a still or a short clip, then add the real sticker (poll, question, link, countdown) in the app.

**Facebook post**
Same video as the Reel, but a longer caption that tells it as a story. Facebook readers click links, so the link goes in the post itself.

**Timing**
Test two slots in week 1, for example 12:00 and 19:30 your time. Keep the one with more saves and shares. TikTok can post daily; Instagram and Facebook 4 to 5 times a week.

---

## Week 1 · The idea

### Mon · Reel / TikTok 1 · "Painted blind"
- **Footage:** home page, contributor view (one lit slot) → toggle to the finished piece. Then 3 seconds of the reveal.
- **Hooks (best first):**
  1. 10,000 squares. Nobody who painted them knew what they'd make.
  2. Everyone got one colour. Nobody saw the picture.
  3. This is what you see when you add a tile. This is what you made.
- **Beats:**
  - 0 to 2s: hook over the single lit slot
  - 2 to 8s: VO "You get one square and one colour. Paint anything you like in it. A cat, a wave, your initials."
  - 8 to 13s: toggle to the full piece. VO "Ten thousand squares, painted the same way."
  - 13 to 18s: reveal zoom-out. On screen: "Sample mosaic"
  - 18 to 20s: end card
- **Instagram caption:** Each square in a Tessera mosaic is painted by someone who only knows their colour. Nobody saw the photo until the last tile landed. That's a Tessera hidden mosaic. Founding mosaics open soon: link in bio.
- **Instagram hashtags:** #mosaic #collaborativeart #weddinggift #handmadeart #tessera
- **TikTok:** caption "they only knew their colour" · #mosaicart #art #weddingtok #giftideas #satisfying · cut the VO tight, let the zoom-out run long.
- **Facebook:** post the same video. Caption: "Each square gets one colour, and whoever paints it can make anything they like. Nobody sees the picture. Here's what it became. (This one is a sample we made to show how it works.) We're opening founding mosaics soon for weddings, birthdays and family gifts. Join the list: {{waiting list link}}"

### Tue · Carousel 1 · "How a hidden mosaic works"
- **Slides:**
  1. Cover: "How a hidden mosaic works" over the finished sample
  2. "1. You upload one photo. Only you see it whole."
  3. "2. We cut it into slots. Each guest gets one colour, never the picture."
  4. "3. They paint anything, by hand. Friends first, then our artists fill the rest."
  5. "4. On your date, it's revealed. One tile, then the whole picture."
  6. "From $45 for 10,000 squares. Guests never pay. Join the list for a founding mosaic."
- **Caption:** Four steps, one surprise. Save this for the next wedding, big birthday or leaving do. Founding mosaics: link in bio.
- **Hashtags:** #howitworks #mosaic #giftideas #weddingideas #tessera
- **Facebook:** same slides as an album. Caption adds: "Good for weddings, anniversaries, retirements and big birthdays. Join the list: {{waiting list link}}"

### Wed · Reel / TikTok 2 · "The reveal"
- **Footage:** the exported reveal video from `/reveal?id=sample-dusk`, full length. Nothing else.
- **Hooks:**
  1. Wait for the zoom-out.
  2. This is one tile. Now watch.
  3. A wedding gift in 20,000 hand-painted squares, revealed.
- **Beats:** let the export play. Add the hook at the top for the first 2 seconds and "Sample mosaic" in a corner. End card.
- **Caption:** The reveal starts on one tile and pulls back until you see the whole thing. Every couple gets this video. Link in bio for founding mosaics.
- **Hashtags:** #reveal #weddinggift #mosaic #art #tessera
- **TikTok:** best fit of the week. Trending soft instrumental sound at low volume. #reveal #weddingtok #art #satisfying #giftideas
- **Facebook:** post natively (not a YouTube link). Caption: "The moment it all comes together. Every mosaic ends with this reveal video, made to share. Founding mosaics: {{waiting list link}}"

### Thu · Story set · "Would you"
- Poll on a still of the contributor view: "Would you paint a square blind?" Yes / Show me first
- Question sticker: "Who would you make one for?"
- Repost Wednesday's reel

### Fri · Reel / TikTok 3 · "Who it's for"
- **Footage:** quick cuts of the finished sample, the slot view, the reveal, with text cards between.
- **Hooks:**
  1. Five gifts you can't buy in a shop.
  2. For the person who says they don't want anything.
  3. The wedding gift every guest helps make.
- **Beats:** 1.5 seconds per card: "A wedding, painted by every guest" · "50 years married, painted by the grandkids" · "A retirement, painted by the whole office" · "A birthday, painted by everyone who couldn't be there" · "A team, painted by the team" · end card.
- **Caption:** Weddings, anniversaries, retirements, birthdays, teams. Anyone with a photo and a group who loves them. Founding mosaics: link in bio.
- **Hashtags:** #giftideas #anniversarygift #retirementgift #weddinggift #tessera
- **Facebook:** this is the strongest Facebook post of the week. Caption: "Looking for a gift for someone who has everything? A Tessera mosaic turns one photo into a picture painted by everyone who loves them. Each person paints one square without seeing the photo, and it's revealed all at once. Join the list for a founding mosaic: {{waiting list link}}"

### Sat · Single image · "Sizes"
- **Image:** the three sizes as cards, same as the site's Sizes section
- **Caption:** Small, 10,000 tiles, $45, for landscapes and pets. Medium, 20,000 tiles, $95, for faces you can recognise. Large, 30,000 tiles, $145, for group photos. Grand, 40,000 tiles, $195, for big groups and large prints. Guests never pay. Link in bio.
- **Hashtags:** #mosaic #giftideas #tessera

---

## Week 2 · The artists

Artist sign-ups fill the slots friends don't. This week recruits them, and shows customers there's always someone to finish the picture.

### Mon · Reel / TikTok 4 · "Get paid to paint one colour"
- **Footage:** `/challenge` grid scrolling, tap an open slot, the colour fills the screen.
- **Hooks:**
  1. Artists: here's a colour. Paint anything in it.
  2. A paid art prompt, every day, in one colour.
  3. Small paintings, real people's gifts, a share of the price.
- **Beats:** hook · scroll the challenge · tap a slot, colour fills the screen · VO "Pick a slot. Make anything in that colour, by hand. When the mosaic is revealed, the artists share 30% of the price." · "Favourite tiles count double." · end card "Artists: link in bio"
- **Caption:** The colour challenge is open to artists. Pick an open slot, make a small piece in its colour, and share 30% of the price with the other artists on that mosaic. Hand-made only. Link in bio to sign up.
- **Hashtags:** #artistsoninstagram #artchallenge #colourchallenge #illustration #tessera
- **TikTok:** strong fit. #artistsoftiktok #artchallenge #arttok #illustration #sidehustle
- **Facebook:** share to the Page, then to local art groups that allow it (read each group's rules first, and post as yourself with a short note, not an ad).

### Tue · Carousel 2 · "How artists get paid"
- **Slides:**
  1. Cover: "How Tessera artists get paid"
  2. "Every order sets aside 30% for the artists who fill its open slots."
  3. "It's split by accepted tiles. The customer's favourite tiles count double."
  4. "Each artist can fill up to 3% of a mosaic, at least 10 tiles. So no one takes it all."
  5. "Earnings clear 14 days after the reveal. Cash out from $10."
  6. "Hand-made only. Every tile is reviewed by a person."
- **Caption:** The whole split, no small print. Artists, link in bio to join.
- **Hashtags:** #artistsoninstagram #artbusiness #illustration #artchallenge #tessera
- **Before posting:** payouts are mocked until a payout provider is added (README, Phase 2). Post this only once real payouts are ready, or add "Payouts open at launch" to slide 5.

### Wed · Reel / TikTok 5 · "Speed paint in one colour"
- **Footage:** `{{artist clip}}`: a real artist painting a small tile in one colour, sped up, with their permission. If you don't have one yet, paint one yourself, hands only.
- **Hooks:**
  1. My colour was this exact {{colour name}}. Here's what I made.
  2. One colour, two minutes, one tile of someone's wedding.
  3. I don't know what picture this is part of.
- **Caption:** I only know my colour. I'll find out what it was part of on the reveal day. Artists, link in bio.
- **Hashtags:** #speedpaint #oneColour #artchallenge #illustration #tessera
- **TikTok:** #speedpaint #arttok #artistsoftiktok #satisfying #painting

### Thu · Story set · "Pick my colour"
- Slider sticker on a colour swatch: "How hard is this colour to paint?"
- Question sticker: "Artists: what would you make in this colour?"
- Share the best answers Friday

### Fri · Reel / TikTok 6 · "Tint to fit"
- **Footage:** `/join`, upload a tile, drag the tint slider from 0 to max, the tile shifts into the slot colour.
- **Hooks:**
  1. Your drawing doesn't have to match. We tint it to fit.
  2. Any doodle can be part of the picture.
  3. You don't need to be an artist to add a tile.
- **Caption:** Draw in whatever you have. Tessera tints your tile gently toward its colour so it fits the picture, and you choose how much. Link in bio.
- **Hashtags:** #doodle #mosaic #handmade #art #tessera
- **Facebook:** frame it for guests, not artists: "Worried your aunt can't draw? She doesn't need to. Any doodle works."

### Sat · Single image · "Paint as many"
- **Image:** five small painted squares in neighbouring colours: "One square, or fifty."
- **Caption:** Every guest can paint as many squares as they like, each in a new colour. The more they paint, the more of the picture is theirs. Link in bio.
- **Hashtags:** #mosaic #giftideas #painting #tessera

---

## Week 3 · Founding mosaics

### Mon · Reel / TikTok 7 · "We're opening {{number}} founding mosaics"
- **Footage:** the reveal, then the order flow `/start` quickly, then end card.
- **Hooks:**
  1. We're opening {{number}} founding mosaics.
  2. Want the first one for your wedding?
  3. The first {{number}} mosaics get {{founding offer}}.
- **Caption:** The first {{number}} founding mosaics open on {{launch date}} with {{founding offer}}. Join the list and you'll hear first. Link in bio.
- **Hashtags:** #founding #weddinggift #mosaic #giftideas #tessera
- **Facebook:** link in the post. Pin it to the top of the Page.
- **Do not post** until `{{number}}`, `{{launch date}}` and `{{founding offer}}` are decided. If there's no offer, drop hook 3 and that clause.

### Tue · Carousel 3 · "Questions people ask"
- **Slides:**
  1. Cover: "Questions people ask"
  2. "Can guests see the picture? No. Each one sees their slot and its colour."
  3. "What if people don't join? Our artists fill open slots, and we fill the rest before your date."
  4. "Can people use AI? No. Tiles are made by hand, and a person checks every one."
  5. "Do guests pay? Never."
  6. "What do I get? The finished mosaic, the reveal video and a link to every tile."
- **Caption:** Ask anything else in the comments. Founding mosaics: link in bio.
- **Hashtags:** #faq #mosaic #weddinggift #giftideas #tessera
- Save to the FAQ highlight.

### Wed · Reel / TikTok 8 · "The last tile"
- **Footage:** the reveal export, slowed on the moment before the zoom-out.
- **Hooks:**
  1. The last tile is always the best part.
  2. When the last square lands.
  3. Everyone opens the link at the same time.
- **Caption:** Everyone who painted gets the link on the same day. One tile, then the whole picture. Link in bio.
- **Hashtags:** #reveal #mosaic #art #weddinggift #tessera

### Thu · Story set · countdown
- Countdown sticker to `{{launch date}}`
- Link sticker to `{{waiting list link}}`
- "Reply with who you'd make one for"

### Fri · Reel / TikTok 9 · "Behind the build"
- **Footage:** the site being clicked through, fast, start to reveal.
- **Hooks:**
  1. I built a way for everyone who loves someone to paint one gift.
  2. How a hidden mosaic gets made, start to finish, in 20 seconds.
  3. From one photo to the reveal.
- **Caption:** One photo in, one picture made by everyone out. Founding mosaics open {{launch date}}. Link in bio.
- **Hashtags:** #buildinpublic #mosaic #art #giftideas #tessera
- **TikTok:** #buildinpublic #startup #art #satisfying #giftideas

### Sun · All platforms · "The list opens"
- Same post on all three: the reveal still with "Founding mosaics open {{launch date}}".
- **Caption:** Founding mosaics open {{launch date}}. If you've been saving this for a wedding, a big birthday or a goodbye, now's the time. Link in bio.
- After launch: change every "link in bio" CTA to "Start yours: link in bio".

---

## Daily stories (all three weeks)

| Day | Week 1 | Week 2 | Week 3 |
|---|---|---|---|
| Mon | Repost Reel 1 | Repost Reel 4, "Artists wanted" | Repost Reel 7 |
| Tue | "Swipe the new post" | "Swipe the new post" | "Swipe the new post" |
| Wed | Reveal clip, link sticker | Question: "What's your colour?" | Repost Reel 8 |
| Thu | Poll + question (see above) | Slider + question (see above) | Countdown + link |
| Fri | Repost Reel 3 | Best answers from Thursday | Repost Reel 9 |
| Sat | Sizes card | "Paint as many" card | "Questions? Ask here" |
| Sun | "Who would you make one for?" answers | A sample tile close-up | "The list opens" |

---

## Facebook only

Facebook buyers are older on average: parents, grandparents, office organisers. Lean on anniversaries, retirements, family reunions and memorials.

**Groups:** wedding planning groups, local community groups, local art groups. Read each group's rules. Post as yourself, as a maker sharing a project, with the reveal video and one question ("Would you want this for your wedding?"). Never paste the same post in many groups on the same day.

**Extra Facebook posts (one a week):**
1. **Anniversary.** "For a 50th: one wedding photo, painted by the children, grandchildren and old friends. Nobody sees the picture until the anniversary." Use only the sample until you have a real one.
2. **Retirement.** "Instead of a card everyone signs, a picture everyone paints." Show the Large size.
3. **Memorial.** Write gently and post only when ready: "For a family remembering someone, everyone paints one square of a favourite photo." No hooks, no countdowns, no emoji on this one.

---

## Replies and DMs

**"How much?"**
> From $45 for 10,000 tiles. For a wedding with faces you can recognise, Medium is 20,000 tiles for $95. Guests never pay. Join the list here: {{waiting list link}}

**"Is it AI?"**
> No. Tiles from guests and artists are made by hand, and a person checks every one. AI-made uploads are turned away.

**"What if my guests don't do it?"**
> Tessera artists pick up the open squares, so your mosaic always finishes on time.

**"Can I be an artist?"**
> Yes. Pick open slots in the colour challenge and share 30% of each mosaic's price with the other artists. Sign up here: {{artist link}}

**Negative or "this is pointless"**
> Reply once, kindly, or not at all. Never argue.

---

## Paid ads (optional, after week 2)

Only run ads once at least one organic Reel has clearly beaten the rest on saves and shares. Boost that one; don't make new ads.

- **Meta (Instagram + Facebook):** boost the winning reveal Reel. Audience: engaged couples and people interested in weddings or gifts, `{{country}}`. Budget `{{daily budget}}` for 7 days. Goal: link clicks to the waiting list.
- **TikTok:** Spark Ad on the winning organic TikTok, same goal and budget.
- Stop any ad whose cost per sign-up is above `{{max cost per sign-up}}` after 3 days.

---

## What to track each Sunday

| Number | Where |
|---|---|
| Waiting list sign-ups | your list tool |
| Artist sign-ups | your list tool |
| Saves and shares per post | Instagram insights, TikTok analytics |
| Link clicks | Instagram, Facebook insights |
| Best hook of the week | the post with the highest 3-second view rate |

Next week, make two more posts with the best hook's angle.

---

## Weekly rhythm after launch

- **Mon:** a reveal (real customers' only, with permission)
- **Wed:** artist content (a speed paint, an artist spotlight with permission)
- **Fri:** a gift idea for the next occasion on the calendar
- **Daily:** one story; reply to every comment within a day
- **Monthly:** a carousel recapping the month's mosaics, with tile counts from the site, not estimates

---

## Rules for every post

- No invented numbers, customers, quotes or reviews. The sample is labelled "Sample mosaic" every time.
- Show a real person's tile, face, photo or mosaic only with their permission, in writing.
- No em dashes. Plain, warm words. No hype.
- Max 5 hashtags on Instagram, 3 to 5 on TikTok, 0 to 2 on Facebook.
- Never say "AI" as a feature. Only to say tiles are made by people.
- Captions on every video.

## Before you start

1. **Waiting list:** set one up (a simple form is fine). Fill `{{waiting list link}}`, and `{{artist link}}` for a separate artist sign-up.
2. **Handle:** pick one free on all three platforms and fill `{{handle}}`.
3. **Launch date, number of founding mosaics and any founding offer:** decide before week 3.
4. **Artist clip:** film one real speed paint for Reel 5, with permission.
5. **Prices:** $45 / $95 / $145 / $195 for 10,000 / 20,000 / 30,000 / 40,000 tiles. Every post quotes them.
6. **Phase 2:** cross-device orders and real payouts. Until both are done, don't say "order now" or promise artist payments by a date.
