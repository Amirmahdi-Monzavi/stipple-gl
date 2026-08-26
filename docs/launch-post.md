# LinkedIn launch post

Three drafts. The first is the recommended one — it leads with a concrete engineering insight rather than an announcement, which is what makes technical posts travel.

Replace `github.com/…` and the playground URL before posting. Attach a screen recording of the playground: disperse → morph → drag an SVG in → morph again. Video outperforms stills heavily on LinkedIn.

---

## Draft A — lead with the insight (recommended)

> I spent a while convinced my particle morphing effect looked "noisy" because I needed better easing.
>
> It wasn't the easing. It was an assignment problem.
>
> When a cloud of particles morphs into a shape, you sample the shape into N points and move N particles onto them. The part nobody mentions is _which particle goes to which point_. I was pairing them randomly. So a particle on the left of the cloud would fly to the right of the shape, crossing paths with hundreds of others. The result reads as static resolving into an image.
>
> The fix took about thirty lines: sort the particles by their angle around the cloud's centre, sort the sampled points by their angle around the shape's centre, and pair the two sorted orders. Particles keep their rough angular position through the transition, so the shape appears to condense rather than reshuffle.
>
> For two concentric rings this reaches the mathematically optimal pairing. In practice it cut total travel distance sharply — and let me delete the swirl effect I'd added to hide the churn.
>
> That's one of about a dozen things I fixed while extracting this from two production apps into an open-source package.
>
> 𝗦𝘁𝗶𝗽𝗽𝗹𝗲-𝗴𝗹 — a WebGL2 particle field that morphs into any SVG.
>
> ↳ 13 KB gzipped, zero dependencies
> ↳ 25,000 particles at 8 ms of CPU per frame
> ↳ Zero allocation per frame — no GC pauses mid-animation
> ↳ Written in TypeScript, with a React binding
> ↳ Drop in any SVG and it becomes the target
>
> The other changes worth mentioning: the vertex format went from 28 bytes to 16 by packing colour into a single uint32. The SVG sampler stopped scanning two million pixels on every resize. And the noise function stopped calling Math.sin a hundred thousand times a frame.
>
> Playground (drag your own SVG in): [link]
> Source: [link]
>
> Built it for a face-and-voice identity verification product and a corporate site. Figured other people might want it too.
>
> #webgl #typescript #frontend #opensource #creativecoding

---

## Draft B — shorter, product-first

> I open-sourced the particle engine I built for two production apps.
>
> 𝘀𝘁𝗶𝗽𝗽𝗹𝗲-𝗴𝗹 renders a WebGL2 particle field that morphs into any SVG you give it. One scalar drives the whole thing — 0 is a dispersed 3D cloud, 1 is your shape, and anything between is a state you can animate from scroll position, a route change, or a checkbox.
>
> ↳ 13 KB gzipped, zero dependencies, no three.js
> ↳ One draw call, zero allocation per frame
> ↳ 25,000 particles at 8 ms of CPU per frame
> ↳ TypeScript, React binding, three render modes
> ↳ Also works as a plain particle background if that's all you need
>
> The rebuild was the interesting part. The original ran fine but allocated the entire scene every frame — roughly 2 GB of garbage per minute. It scanned two million pixels every time the window resized. And it assigned morph targets randomly, which is why the transition looked like noise instead of a shape condensing.
>
> Fixing those three things is most of the difference between a demo and a library.
>
> Playground: [link]
> Source: [link]
>
> #webgl #typescript #opensource #frontend

---

## Draft C — the honest-rebuild angle

> Something I've learned shipping my first open-source package:
>
> The code that works in your app is maybe 60% of a library.
>
> I had a WebGL particle system running in two production apps. Looked great. Clients were happy. I figured packaging it would take a weekend.
>
> Then I actually read it as if someone else had written it:
>
> → It allocated ~5,000 objects and a fresh typed array every frame. At 60fps that's about 2 GB of garbage a minute.
> → Its noise function called Math.sin around 100,000 times per frame.
> → It rescanned two million pixels every time the window resized.
> → It attached mouse listeners to `document`, so two instances would fight.
> → It looped over every particle on every mousemove to hit-test.
> → Several options were documented in the type but never actually read by the code.
> → The animation ran twice as fast on a 120 Hz display.
>
> None of that mattered in my apps. All of it matters in a package someone else depends on.
>
> So: zero allocation per frame, integer-hash noise, a bounded sampler, scoped listeners, O(1) hit-testing, dead options deleted, frame-rate-normalised motion. Plus context-loss recovery, auto-pause when offscreen, and prefers-reduced-motion — the unglamorous things that separate a demo from something you'd put in production.
>
> 𝘀𝘁𝗶𝗽𝗽𝗹𝗲-𝗴𝗹: a WebGL2 particle field that morphs into any SVG. 13 KB gzipped, zero dependencies, 25,000 particles at 8 ms a frame.
>
> Playground: [link]
> Source: [link]
>
> #opensource #webgl #typescript #frontend

---

## Notes on posting

**Format.** LinkedIn truncates around 210 characters. The first two lines decide whether anyone expands it, so keep the hook above that fold and put nothing important in the first paragraph but the hook itself.

**Links in comments.** LinkedIn's algorithm demotes posts with external links in the body. Post the text with links removed, then add them in the first comment and edit the post to say "links in the comments."

**Media.** A 10–20 second screen recording of the playground will do more than any wording choice here. Show the morph, then drag in an SVG.

**Timing.** Tuesday to Thursday, 8–10am in the timezone where most of your audience is.

**Follow-ups.** Do not put everything in one post. Each of these is its own post a week apart: the assignment problem, the 28→16 byte vertex packing, why the scroll module refuses to hijack scrolling, and the eventual GPU transform-feedback backend. A package launch is a series, not an announcement.

**Also post to:** r/webgl, r/javascript (they dislike self-promotion without substance — lead with the technical writeup, not the package), Hacker News Show HN, and the dev.to / Hashnode crossposts of `docs/architecture.md`, which is written to stand alone as an article.
