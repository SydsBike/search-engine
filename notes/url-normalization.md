# URL normalization specification

**FROZEN as of 2026-09-06.** Spec authored by Jim; normative claims verified against
the RFC 3986 text directly on 2026-09-06 — not recalled. One verification finding is
recorded at the bottom, pending Jim's confirmation; it does not change any rule's
output.

**Why frozen:** `frontier.url` is the primary key, so this specification IS the
dedupe mechanism. Changing a rule mid-crawl does not error — it silently duplicates.
Any change after the crawl starts means accepting a full recrawl.

**Governing principle:** normalize what a spec guarantees identical; preserve what
merely *tends* to be identical. Knowing exceptions are taken deliberately, with
conditions attached, and are labeled below.

---

## The rules

**1. Scheme lowercased.** RFC 3986 §6.2.2.1: schemes are case-insensitive,
"should be normalized to lowercase."

**2. Allowed schemes: `http`, `https` only.** Everything else (`mailto:`,
`javascript:`, `ftp:`, `tel:`, …) is rejected — the normalizer returns nothing and
the link never reaches the frontier. Policy, not RFC.

**3. Scheme preserved as given — `http` is never rewritten to `https`.** A rewrite
would fabricate a URL nobody gave us and assume the server honors it; when wrong, a
live page silently becomes an error. Accepted cost: `http://` and `https://`
spellings of one page are two frontier rows, collapsed visibly at fetch time by the
redirect machinery.

**4. Host lowercased.** RFC 3986 §6.2.2.1: the host is case-insensitive, "should be
normalized to lowercase." DNS-guaranteed safe.

**5. Subdomains preserved — no www-stripping.** `www.example.com` and `example.com`
are separate frontier rows AND separate `host_state` rows (own robots.txt, own rate
limit, own 100-page budget). Accepted cost, same reasoning as rule 3: the two hosts
merely *tend* to serve the same content.

**6. Port stripped only when it matches the scheme's default** (`http:80`,
`https:443`). RFC 3986 §6.2.3: an explicit port that is "empty or the default for
the scheme … should be removed." Cross-matched cases like `http://host:443/` name a
real distinct destination and are kept. (Per the same sentence, a bare empty port —
`http://host:/` — is also elided; treated as within this rule.)

**7. Fragment always stripped.** RFC 3986 §3.5: the fragment "is separated from the
rest of the URI prior to a dereference" and is used solely by the user agent — it is
never sent in the HTTP request, so the server cannot distinguish `page#a` from
`page#b`. Strongest guarantee on the list. Known exception recorded and accepted:
old `#/`-routing JS apps render nothing without script execution, so their content
is unreachable for this crawler regardless.

**8. Path case preserved.** No spec makes `/About` and `/about` identical; on Linux
servers they are routinely different resources.

**9. Trailing slash preserved.** `/products` vs `/products/` is not guaranteed
identical. (The empty path is the separate, guaranteed case — rule 11.)

**10. Dot segments resolved per RFC 3986** — applied, not deleted:
`/blog/posts/../pricing` → `/blog/pricing`. §6.2.2.3 directs normalizers to apply
the `remove_dot_segments` algorithm of §5.2.4; excess `..` above root is discarded
silently (verified — no error). Browsers do this before the request, so the server
never sees the dotted spelling. Also closes the `/a/../a/../a/` crawler-trap
loophole.

**11. Empty path → `/`.** RFC 3986 §6.2.3: with an authority present, an empty path
"should be normalized to a path of `/`." Matches the step 3 probe finding
(curlie.org → curlie.org/).

**12. Query parameter order preserved.** Reordered duplicates are rare in the wild —
links are usually machine-generated the same way each time.

**13. Tracking parameters stripped — KNOWING EXCEPTION #1.** Click IDs are unique
per click, so preserving them means unbounded frontier variants of single popular
pages — the calendar trap in another form. Two conditions attached:

- The list is **frozen with this spec.** Adding to it mid-crawl is a normalization
  change — the one-way door.
- The list is conservative: only parameters whose documented purpose is analytics.
  No guessing that `ref` or `source` are tracking; those names are also used
  functionally.

**The frozen list:** `utm_*` (prefix match), `fbclid`, `gclid`, `msclkid`,
`mc_eid`. Nothing else.

**14. Empty query stripped** (`page?` → `page`) — **KNOWING EXCEPTION #2, see
verification note below.** The output is unambiguous and the rule stands; its
original rationale ("nothing is being guessed about") turned out to be wrong per the
RFC's own text.

**15. Percent-encoding per RFC 3986 equivalence rules:**

- Hex digits uppercased: `%7e` → `%7E` (§6.2.2.1 — case-insensitive, normalize to
  uppercase).
- Unreserved characters decoded: `%7E` → `~` (§6.2.2.2 — decode any percent-encoded
  octet corresponding to an unreserved character; unreserved = `ALPHA / DIGIT /
  - . _ ~` per §2.3).
- Everything else preserved byte-for-byte. Reserved characters are NEVER decoded
  even though mechanically possible — §2.2: decoding a percent-encoded octet
  corresponding to a reserved character "will change how the URI is interpreted."
  `%2F` is data inside a segment; `/` is a segment boundary.

---

## Accepted costs (duplicates this spec chooses to tolerate)

| source | cost |
|---|---|
| rule 3 | `http://` and `https://` rows for one page; collapses at fetch via redirects |
| rule 5 | `www.` and apex as separate rows, hosts, and budgets |
| rule 7 | `#/`-routed JS app content unreachable (unreachable for us anyway) |
| rule 8 | `/About` vs `/about` rows where servers treat them identically |
| rule 9 | `/products` vs `/products/` rows where servers treat them identically |
| rule 12 | reordered-query duplicates (rare) |

---

## Verification notes — 2026-09-06, against RFC 3986 text

Confirmed as quoted: §2.3 unreserved set; §6.2.2.1 case normalization (scheme,
host, hex digits); §6.2.2.2 decode-unreserved-only; §6.2.2.3 + §5.2.4 dot-segment
removal with excess `..` silently discarded; §6.2.3 default-port elision and empty
path → `/`; §3.5 fragment never sent; §2.2 decoding reserved octets changes
interpretation.

**Finding on rule 14 (empty query):** RFC 3986 §6.2.3 states the opposite of the
rule's original rationale:

> "Normalization should not remove delimiters when their associated component is
> empty unless licensed to do so by the scheme specification. For example, the URI
> `http://example.com/?` cannot be assumed to be equivalent to any of the examples
> above."

So stripping the empty `?` is NOT a spec-guaranteed equivalence — it is a policy
choice, the same epistemic category as rule 13. The rule's output is unchanged and
the rule stands; it is reclassified as a second knowing exception. Under the
governing principle this is the honest label. **Pending Jim's confirmation.**

---

## Out of scope of this spec

- **Relative-reference resolution.** `../pricing` and relative `Location` headers
  need resolving against a base URL before normalization. Design parked: instinct
  is two composed functions — `resolve(href, base)` then `normalize(absolute)` —
  keeping the normalizer pure with one input. Whatever shape lands, the 15 rules
  bind the normalize step.
- **Rejection representation.** How "returns nothing" (rule 2) is spelled in
  TypeScript is an implementation decision. One architectural constraint: rejection
  is an EXPECTED outcome, thousands of times per crawl — expected conditions don't
  throw (step 3 lesson).

## Implementation flags

- The WHATWG `URL` class does some of this automatically (scheme/host lowercasing,
  dot-segment resolution, default-port stripping, empty path → `/`) but NOT all of
  it, and it does some things this spec does NOT want — it can alter
  percent-encoding in ways rule 15 constrains, and its `searchParams` iteration
  semantics need checking against rule 12. The gap between what `URL` gives for
  free and what the spec requires IS the implementation work. Verify rule by rule;
  where `URL` fights the spec, hand-roll that piece.
