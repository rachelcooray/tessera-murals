/**
 * Emails Tessera sends, as plain HTML and text, and a tiny sender for Resend (resend.com).
 * Kept free of Deno and Node specifics so tests can check the wording and links.
 */

export interface Email { to: string; subject: string; html: string; text: string }
export type Mailer = (e: Email) => Promise<void>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function orderEmail(o: { to: string; title: string; tiles: number; revealAt: string; dashboardUrl: string; inviteUrl: string; test: boolean }): Email {
  const date = new Date(o.revealAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const subject = `Your mosaic “${o.title}” is ready for painting`;
  const text = [
    `Your hidden mosaic "${o.title}" is set up${o.test ? " (a test order, nothing was charged)" : ""}.`,
    "",
    `Share this invite link with everyone you'd like to paint a square:`,
    o.inviteUrl,
    "",
    `Each person gets one colour, never the picture. It's revealed on ${date}.`,
    "",
    `Your mosaic's page, where you can watch it fill and reveal it (keep this private):`,
    o.dashboardUrl,
    "",
    "Tessera",
  ].join("\n");
  const btn = (href: string, label: string) => `<a href="${esc(href)}" style="display:inline-block;padding:14px 22px;background:#c9a24f;color:#0e0b09;text-decoration:none;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:13px">${esc(label)}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#0e0b09;color:#efe3cc;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:36px 24px">
<p style="letter-spacing:.2em;font-size:13px;color:#c9a24f;margin:0 0 24px">TESSERA</p>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.2;margin:0 0 16px">“${esc(o.title)}” is ready for painting</h1>
<p style="font-size:16px;line-height:1.6;color:#d8ccb6">${o.tiles.toLocaleString("en-GB")} squares are waiting. Share the invite link with everyone you'd like to take part. Each person gets one colour, never the picture. It's revealed on <b>${esc(date)}</b>.${o.test ? " <i>(A test order: nothing was charged.)</i>" : ""}</p>
<p style="margin:28px 0">${btn(o.inviteUrl, "Copy your invite link")}</p>
<p style="font-size:14px;line-height:1.6;color:#a89a84">Or copy it: <a href="${esc(o.inviteUrl)}" style="color:#c9a24f">${esc(o.inviteUrl)}</a></p>
<p style="font-size:14px;line-height:1.6;color:#a89a84;margin-top:28px">Your mosaic's page, where you can watch it fill and reveal it. Keep this one private: <a href="${esc(o.dashboardUrl)}" style="color:#c9a24f">open your mosaic</a>.</p>
</div></body></html>`;
  return { to: o.to, subject, html, text };
}

export function resendMailer(apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer {
  return async (e) => {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text }),
    });
    if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text().catch(() => "")}`);
  };
}
