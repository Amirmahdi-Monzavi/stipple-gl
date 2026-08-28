# LinkedIn launch post

The final version is first, with the real links in it. The three earlier drafts
are kept below for reference.

Attach a screen recording of the playground rather than a still — disperse,
morph, drag an SVG in, morph again. `docs/hero.gif` works if you would rather
not record one.

---

## Final — written for a feed that is not all engineers

> I spent a week convinced my particle animation looked wrong because the easing
> was off.
>
> It wasn't the easing.
>
> When a cloud of particles forms a shape, you sample the shape into points and
> move each particle onto one. The part nobody mentions is _which_ particle goes
> to which point. I was pairing them at random — so a particle on the left of the
> cloud would fly to the right of the shape, crossing hundreds of others on the
> way. Thousands of paths tangling at once. It reads as static resolving into a
> picture, and no amount of easing fixes it, because the easing was never the
> problem.
>
> The fix was about thirty lines. Sort the particles by their angle around the
> centre of the cloud, sort the target points by their angle around the centre of
> the shape, and pair them in that order. Nobody crosses anybody. The shape
> condenses instead of shuffling.
>
> I had also added a swirl effect to disguise the churn. I got to delete it.
>
> That is one of a dozen or so things I fixed while pulling this out of two
> production apps and into an open-source package.
>
> stipple-gl — a WebGL2 particle field that morphs into any SVG.
>
> → 12.4 KB gzipped, zero dependencies, no three.js
> → 25,000 particles at 8 ms of CPU per frame
> → No allocation per frame, so the garbage collector stays out of the animation
> → TypeScript, with a React binding
> → Drop any SVG in and it becomes the target
>
> Play with it (drag your own SVG onto it): https://stipple-gl.vercel.app/playground/index.html
> Docs and examples: https://stipple-gl.vercel.app
> Source: https://github.com/Amirmahdi-Monzavi/stipple-gl
> npm: npm i stipple-gl
>
> Built it for a face-and-voice identity verification product and a corporate
> site. Figured other people might want it too.
>
> #webgl #typescript #frontend #opensource #creativecoding

**Why this shape.** The opening is a mistake rather than an announcement, which
gives a non-engineer somewhere to stand — everyone has been confidently wrong
about a cause. The technical middle stays in plain language and never names an
algorithm. The numbers arrive after the story, where they read as evidence
rather than as specifications.

**Two things to decide before posting.**

LinkedIn suppresses reach on posts with external links. Moving the four links to
the first comment usually reaches further, at the cost of a little friction. Your
call, and it matters more with 500+ connections than it would with 50.

The earlier drafts used bold Unicode for the name. It is invisible to screen
readers, which read it character by character or skip it. Plain text is used
above.

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
