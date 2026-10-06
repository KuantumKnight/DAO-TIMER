"use client";
export default function Error({ reset }: { reset: () => void }) { return <main className="error-page"><h1>The display needs a refresh.</h1><p>Your event clock is saved centrally.</p><button className="primary-button" onClick={reset}>Try again</button></main>; }
