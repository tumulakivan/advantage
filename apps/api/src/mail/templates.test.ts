import { describe, expect, it } from "vitest";

import { escapeHtml, existingAccountEmail, resetPasswordEmail, verificationEmail } from "./templates";

const URL_WITH_QUERY = "http://localhost:4000/api/auth/verify-email?token=abc.def&callbackURL=http%3A%2F%2Flocalhost%3A5173%2Fverify";

describe("escapeHtml", () => {
  it("neutralises every character that can open markup", () => {
    expect(escapeHtml(`<b onclick="x">'&'</b>`)).toBe("&lt;b onclick=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
  });
});

describe("verification email", () => {
  const mail = verificationEmail({
    to: "a@example.test",
    name: "Ana",
    url: URL_WITH_QUERY,
    expiresInHours: 24,
  });

  it("is addressed to the person and says what it is", () => {
    expect(mail.to).toBe("a@example.test");
    expect(mail.subject).toMatch(/confirm/i);
  });

  it("carries the link in both bodies, untouched in the text one", () => {
    expect(mail.text).toContain(URL_WITH_QUERY);
    // In HTML the ampersand must be an entity, or the attribute is malformed.
    expect(mail.html).toContain("token=abc.def&amp;callbackURL=");
    expect(mail.html).not.toContain("token=abc.def&callbackURL");
  });

  it("states how long the link lasts", () => {
    expect(mail.text).toContain("24 hours");
  });
});

describe("a hostile display name", () => {
  const name = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;

  it.each([
    ["verification", verificationEmail({ to: "a@example.test", name, url: URL_WITH_QUERY, expiresInHours: 24 })],
    ["reset", resetPasswordEmail({ to: "a@example.test", name, url: URL_WITH_QUERY, expiresInMinutes: 60 })],
    ["existing account", existingAccountEmail({ to: "a@example.test", name, signInUrl: "http://x/signin", resetUrl: "http://x/forgot-password" })],
  ])("cannot inject markup into the %s email", (_label, mail) => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("reset email", () => {
  it("says the link is single-use and for how long", () => {
    const mail = resetPasswordEmail({ to: "a@example.test", name: "Ana", url: URL_WITH_QUERY, expiresInMinutes: 60 });
    expect(mail.text).toContain("once, for 60 minutes");
    expect(mail.text).toContain(URL_WITH_QUERY);
  });
});

describe("existing-account email", () => {
  it("points at sign-in and at reset, and has no token in it", () => {
    const mail = existingAccountEmail({
      to: "a@example.test",
      name: "Ana",
      signInUrl: "http://localhost:5173/signin",
      resetUrl: "http://localhost:5173/forgot-password",
    });
    expect(mail.text).toContain("http://localhost:5173/signin");
    expect(mail.text).toContain("http://localhost:5173/forgot-password");
    expect(mail.text).not.toMatch(/token=/);
  });
});
