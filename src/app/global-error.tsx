"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0d13", color: "#e7eaf0", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div role="alert" style={{ textAlign: "center" }}>
          <h1>StackQuest is having trouble</h1>
          <p style={{ color: "#a0aabb" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
