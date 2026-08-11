// A native-promise version of the redirect-chain probe — no async/await anywhere.
// Written as a reference to compare against src/probe.ts.

const urlToFetch = "http://news.ycombinator.com";

// The redirect status codes, as a list rather than the 300-399 range.
// 304 Not Modified and 300 Multiple Choices live in that range but are not
// redirects and carry no Location. See notes/http-findings.md.
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

// Recursion has no natural stopping point if a server loops A -> B -> A, so the
// hop budget is what guarantees termination. Browsers use roughly this number.
const MAX_HOPS = 20;

/**
 * One request. Returns the promise as-is — no handling attached here.
 * This is the "does" half; the decision-making lives in followChain.
 */
function fetchOnce(url: string): Promise<Response> {
  return fetch(new Request(url, { redirect: "manual" }));
}

/**
 * Walks a redirect chain, collecting every response along the way.
 *
 * There is no loop here, because a `while` cannot work: its condition is
 * evaluated synchronously, but the status it would test does not exist until a
 * promise settles. Recursion replaces the loop — each call handles one hop and
 * decides whether to invoke itself again.
 *
 * `collected` and `hopsLeft` are parameters rather than module-level state, so
 * every top-level call gets its own accumulator and its own budget. Two chains
 * running at once cannot contaminate each other.
 */
function followChain(
  url: string,
  collected: Response[] = [],
  hopsLeft: number = MAX_HOPS,
): Promise<Response[]> {
  return fetchOnce(url).then((response) => {
    collected.push(response);

    const location = response.headers.get("location"); // string | null
    const isRedirect = REDIRECT_CODES.has(response.status);

    // Three ways to stop, and each one must return, or the chain hangs on a
    // value that never arrives:
    //   - not a redirect        -> the chain ended normally
    //   - redirect, no Location -> malformed; nowhere to go
    //   - out of hops           -> probably a redirect loop
    if (!isRedirect || location === null || hopsLeft <= 0) {
      return collected;
    }

    // Location is often relative ("/path"), which fetch rejects outright.
    // Resolving against response.url turns it into an absolute URL.
    const next = new URL(location, response.url).toString();

    // Returning a promise from inside .then() makes the outer promise wait for
    // the inner one instead of resolving to the promise itself. That flattening
    // is what lets the chain grow to a length not known in advance.
    return followChain(next, collected, hopsLeft - 1);
  });
}

// Note the return type above is a plain Promise<Response[]>, not a union.
// Returning `collected` (a bare array) from inside .then() is fine — .then
// wraps any non-promise return value in a promise automatically, so both exits
// end up the same type.

followChain(urlToFetch)
  .then((chain) => {
    // Logging lives inside .then because that is the only place the settled
    // value exists. Outside it, all you hold is Promise { <pending> }.
    console.log(`Chain for ${urlToFetch} — ${chain.length} response(s):`);
    for (const response of chain) {
      console.log(
        `  ${response.status} ${response.url} ` +
          `-> ${response.headers.get("location") ?? "(end)"}`,
      );
    }
  })
  .catch((error: unknown) => {
    // .catch is the promise-chain equivalent of try/catch. It covers every
    // step above it, including failures inside the recursion.
    // The parameter is `unknown` for the same reason a caught value is:
    // JavaScript permits rejecting with anything, so it must be narrowed.
    if (error instanceof Error) {
      console.log("Failed:", error.message);
    } else {
      console.log("Failed with a non-Error value:", error);
    }
  });

// Running several seeds is a separate question from walking one chain.
// Sequential — each waits for the previous, chained by returning the next call:
//
//   followChain(a).then(() => followChain(b)).then(() => followChain(c));
//
// Concurrent — all start at once, Promise.all settles when every one is done:
//
//   Promise.all([a, b, c].map((u) => followChain(u))).then((chains) => ...);
//
// The async/await version of this file used `await` at each call site, which is
// the sequential form. Concurrency is usually what a crawler wants.
