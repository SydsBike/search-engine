# Language findings — JavaScript and TypeScript

Reference for how the tools behave. Distinct from `notes/http-findings.md`, which
holds protocol observations that feed design decisions. This file is for looking up
*how something works*, not for deciding anything.

Environment unless noted: Node v24.15.0, TypeScript 7.0.2, run via tsx.

---

## Promises and async

**`async` means the function always returns a Promise**, never the value directly.
Calling one starts it, runs until the first `await`, then hands a pending promise
back to the caller. The caller resumes immediately — the function is paused, not
finished.

**`await` inside a function and `await` at the call site are different scopes.**
Awaits inside sequence *that function's own steps*. They say nothing about the
caller. Four un-awaited calls all start at once and interleave their output; adding
`await` at each call site makes them sequential. Concurrency is often what you want —
a crawler needs it — so this is a choice, not a rule.

**Top-level `await` requires ESM.** It is unavailable in CommonJS. Works here because
`package.json` has `"type": "module"`.

**All synchronous code runs to completion before any `.then` callback fires.**
Promise callbacks are queued and only run once the engine has nothing synchronous
left. Consequences:

- `console.log(promise)` prints `Promise { <pending> }`
- `console.log(arrayAPromiseWillFill)` prints `[]`

Registering a callback is not running it. There is no arrangement of top-level
statements that can observe a promise's result — code that needs the value has to
live inside the callback.

**`try`/`catch` does not catch an un-awaited promise rejection.** The `try` block
finishes normally, the rejection surfaces afterward as an *unhandled* rejection, and
the process dies with a raw stack trace instead of the handler running. Hit this with
a missing `await` on `response.json()`.

**`.catch()` is the promise-chain equivalent of `try`/`catch`** and covers every step
above it in the chain, including failures inside recursion. Its parameter is
`unknown` for the same reason a caught value is.

---

## Promise chains without async/await

**A `while` loop cannot drive a promise chain.** Its condition is evaluated
synchronously, but the value it would test does not exist until a promise settles. So
the condition reads a stale value forever, or never becomes true. Nothing inside a
`.then` callback can reach back and update a variable in time for a loop already
running.

**Recursion replaces the loop.** A function performs one step and returns a promise.
Inside its `.then`, it either returns a fresh call to itself (continue) or returns the
accumulated result (stop).

**The enabling mechanism: returning a promise from inside `.then()` makes the outer
promise wait for the inner one** rather than resolving to the promise itself. That
flattening is what lets a chain grow to a length not known in advance. Returning a
non-promise works too — `.then` wraps it automatically, which is why both exits can
share one return type.

**The recursive call goes to the function, not the handler.** The handler *decides*;
the function *does*. A handler has no fetch in it — calling it again would only
re-process a value, not perform new work.

**Accumulator placement is a three-way tradeoff:**

| where | survives hops | isolated per call |
|---|---|---|
| local to the handler | no | yes |
| module scope | yes | no |
| parameter with a default | yes | yes |

The parameter form gets both properties, and is what `src/promise.ts` uses.

**Recursion needs a bound.** Without a hop budget, a server looping A → B → A recurses
until the process dies. Pass the budget alongside the accumulator and decrement it.

---

## TypeScript

**Let inference do the work.** Annotate only what inference cannot derive: function
parameters, empty arrays and objects, and sometimes exported function return types.
An annotation that repeats the initializer is two places to update.

Subtlety: for a `const` holding a string literal, TypeScript infers the *literal
type*, not `string`. Annotating `: string` actually **widens** it. With `let` you get
`string` automatically, since the variable could be reassigned.

**Recursive functions need an explicit return type annotation.** TypeScript cannot
infer one — doing so would require already knowing it.

```
TS7023: 'handleSuccess' implicitly has return type 'any' because it does not have a
return type annotation and is referenced directly or indirectly in one of its return
expressions.
```

This is the clearest case of an annotation carrying information inference genuinely
cannot derive.

**`Promise<T>` is a generic** — the type in the brackets is what it *resolves to*,
not the promise. Same shape as `Response[]` being shorthand for `Array<Response>`.

**With `strict`, a caught value is `unknown`, not `any`.** JavaScript permits throwing
anything, so `.message` is not guaranteed to exist.

- **`any`** means "stop checking" — TypeScript steps aside, you find out at runtime.
- **`unknown`** means "prove it first" — you can hold and pass the value, but not
  reach into it until you have narrowed it.

**Narrow with `instanceof Error`.** It walks the prototype chain at runtime and
TypeScript understands the check, so inside that branch the value is typed `Error`.
Built-in subclasses (`TypeError`, `RangeError`) pass it too.

The known objection — `instanceof` fails across *realms* (iframes, Web Workers, `vm`
contexts) — is real and verified: in a `vm` context, `instanceof Error` returns
`false` where `Error.isError()` returns `true`. It does not apply to a single-realm
Node script, and `Error.isError` is not in TypeScript's lib at `target: es2023`
(TS2550). **Decision: use `instanceof Error`.** Revisit only if code moves into
worker threads or `vm`.

**Passing a filename to `tsc` makes it ignore tsconfig.json entirely** — not just the
file list, but every compiler option. TypeScript errors rather than doing this
silently (TS5112), which is a kindness: without `noEmit`, it would have written `.js`
files next to every `.ts`. Run `npx tsc` with no arguments; the config's `include`
already scopes it. Contrast with `tsx src/probe.ts`, which *does* take a filename —
`tsc` checks a project, `tsx` runs a file.

---

## Objects, printing, serialization

**Errors have no own enumerable properties.** `name`, `message`, and `stack` are
non-enumerable or on the prototype, so `JSON.stringify(err)` yields `{}`. `stack` is a
superset of `message` — its first line is `Name: message`, then the call frames.

**Response objects behave the same way.** Their data lives in prototype getters:

| expression | result |
|---|---|
| `` `${responses}` `` | `[object Response],[object Response]` |
| `String(response)` | `[object Response]` |
| `JSON.stringify(response)` | `{}` |
| `console.log(response)` | full pretty-printed inspection |

**Template literals stringify; `console.log` inspects.** `${}` calls `String()`, and
for an array that means `Array.prototype.toString()` joining comma-separated.
`console.log` given a non-string *walks* the object instead. Two different mechanisms
— interpolating an object loses the useful one.

`console.log` accepts **multiple arguments** and formats each by type, so a label and
an object need not be fused into one string. One call rather than two also keeps them
together as a single atomic write, which matters when concurrent work is logging.

**Log `message` or `stack` depending on expected vs unexpected.** For an error you
constructed yourself, the stack points at your own `throw` and tells you nothing. For
one thrown by code you didn't write, the stack is the whole value. A crawler hitting
thousands of expected timeouts and 404s would drown in identical stacks.

---

## Traps hit in practice

**Two names one underscore apart in the same scope.** `max_Hops` (module) and
`maxHops` (parameter) — typed the wrong one and silently broke a hop budget while
believing it was fixed. Rename so the mistake is impossible rather than merely
visible.

**VSCode can resurrect a deleted file.** A stale editor tab pointing at a renamed-away
file will recreate it on save. Edits went into `fetch.ts` while `probe.ts` was the one
being run. If changes seem to have no effect, check which file is actually open.

**`git restore` does not touch untracked files.** It only reverts files git tracks.

**Push placement relative to the exit path.** Hit twice, in both the loop and the
recursive versions: if the accumulate step lives inside the continue-branch, the
terminal value is never collected. Symptom is an array one element short.
