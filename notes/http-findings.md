# HTTP findings

Running log of HTTP-layer observations, kept outside source files so it survives
code that gets thrown away. Started during Phase 0 step 3 (the fetch probe).

Environment unless noted: Node v24.15.0 on macOS, using the built-in `fetch`.

---

## Redirects

**3xx does not mean "redirect."** The redirect codes are a specific list — **301,
302, 303, 307, 308** — not the numeric range 300–399. Two codes in that range are
not redirects at all:

- **304 Not Modified** — a caching response meaning "your stored copy is current,
  here is no body." No `Location`, no destination.
- **300 Multiple Choices** — `Location` is optional.

Treating 300–399 as "follow this" is wrong and will hang on a 304.

**`Location` is the destination, not the current URL.** `response.url` is where the
response came from.

**`Location` is frequently relative** — `/newpath`, `../other`. The spec permits it
and servers use it constantly. Passing a relative value straight to `fetch` fails:

```
TypeError: Failed to parse URL from /newpath
```

It must be resolved against the URL that produced the response. That is what the
`URL` constructor's second (base) argument is for.

**`fetch` follows redirects silently by default** and collapses the whole chain into
the final response — you get `redirected: true` and a final `url`, but not the hop
count, the intermediate URLs, or the individual status codes. The 301-vs-302
distinction is lost.

**`redirect: "manual"` behaves differently in Node than in a browser.** Node returns
the real 3xx response with headers intact (verified: status 301, readable `location`
header). A browser returns an opaque shell — type `opaqueredirect`, status 0, no
headers. Node is not bound by the same-origin policy.

**301 vs 302 matters to a crawler.** Permanent means the stored URL should be
updated; temporary means keep the original.

---

## Content-Type and charset

**charset is an optional parameter on the Content-Type header, not a separate
field**, and it is frequently absent. Observed both forms:

| URL | Content-Type |
|---|---|
| example.com | `text/html` |
| news.ycombinator.com | `text/html; charset=utf-8` |

Anything storing charset must tolerate its absence.

---

## URLs

**Trailing slashes are added client-side.** Requesting `https://news.ycombinator.com`
returns a `response.url` of `https://news.ycombinator.com/`. This is URL
normalization in the client before the request goes out — *not* a redirect
(`redirected: false`).

Relevant to the crawler's "are these the same URL" logic.

**Requested URL and final URL are different values**, and both matter. The crawler
needs to know it asked for A and received content from B.

---

## Response objects

**`Headers.get()` returns `string | null`** — never `undefined` — when a header is
absent. (`typeof null` is `"object"`, so a `typeof x === "string"` check works but
tests the question sideways.)

**`response.type` has six values**: `basic`, `cors`, `error`, `opaque`,
`opaqueredirect`, `default`. They encode *browser* security restrictions on what
JavaScript may see. **Node does not enforce them** — no origin, no CORS, nothing
withheld. Observed `type` flip from `basic` to `cors` when a redirect crossed
origins, with all headers still readable, including ones a browser would hide.

**Errors have no own enumerable properties.** `name`, `message`, and `stack` are all
non-enumerable or on the prototype, so `JSON.stringify(err)` yields `{}`. `stack` is
a superset of `message` — its first line is `Name: message`, then the call frames.

---

## Known issues in the step 3 probe

`src/probe.ts` is a **disposable probe**, not the seed of the real fetcher (Jim's
ruling, 2026-08-01). The Phase 1 fetcher gets built alongside robots.txt, rate
limiting, concurrency, and timeouts, and its redirect handling will be shaped by
those constraints. These are recorded rather than fixed:

1. **Infinite loop.** The only line reassigning `status` sits inside the
   `typeof location === "string"` guard. A 3xx with no `Location` — a 304, or a
   malformed server — leaves the guard false, nothing changes, and the `while` spins
   forever with no fetch and no delay.
2. **Unbounded chain.** No hop cap. A server redirecting A → B → A loops until
   killed. Browsers cap around 20.
3. **Relative `Location` would throw**, per the redirects section above.
4. **Redundant outer `if`** duplicating the `while` condition, and the two disagree
   (`<= 400` vs `< 400`).

---

## Carries forward

**304 is load-bearing twice.** Once in the crawler's redirect logic, where it must
*not* be treated as a redirect. And again in **Phase 8 incremental recrawl**, where
304 becomes the mechanism you actually want — the server telling you nothing changed,
so the page needn't be refetched or reindexed.

**Schema inputs for Phase 0 step 4:**

- charset is optional and often absent → nullable
- requested URL and final URL are distinct values, both worth storing
- 301 vs 302 determines whether a stored URL should be updated
- a redirect chain is variable-length → storing the chain vs. only the endpoint is a
  schema decision
