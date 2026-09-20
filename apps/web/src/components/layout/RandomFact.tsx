import * as React from "react";

/**
 * A useless fact in the top bar, from uselessfacts.jsph.pl.
 *
 * A new one on every mount - which, since the shell does not remount as you
 * move between screens, means one per page load. Refresh or come back later
 * and you get a different one.
 *
 * Three things keep a bit of fun from becoming a liability. It is fetched once
 * per page load rather than per navigation, so the header is not chattering at
 * somebody else's server. It sends nothing - no credentials, no referrer, no
 * query - because a budget tracker has no business telling a third party who
 * is reading it. And it fails silently: if the fact does not arrive there is
 * simply no line, since an app that holds your financial records should never
 * show you an error about something this unimportant.
 */
const ENDPOINT = "https://uselessfacts.jsph.pl/api/v2/facts/random";

export function RandomFact({ className }: { className?: string }) {
  const [fact, setFact] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    fetch(ENDPOINT, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      // The endpoint sends no cache headers, which leaves a browser free to
      // apply its own heuristics and hand back the same fact on the next
      // reload. Saying it outright is what makes "a new one each visit" true.
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { text?: string } | null) => {
        const text = body?.text?.trim();
        if (text) setFact(text);
      })
      .catch(() => {
        // Offline, blocked, or having a bad day. Not our problem to report.
      });

    return () => controller.abort();
  }, []);

  if (!fact) return null;

  // A fact can run long. The header truncates it and the title holds the whole
  // thing, so a wordy one cannot push the layout around.
  return (
    <p className={className} title={fact}>
      {fact}
    </p>
  );
}
