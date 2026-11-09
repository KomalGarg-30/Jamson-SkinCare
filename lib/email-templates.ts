import { getEnv } from "@/lib/env";

export type EmailContent = { subject: string; html: string; text: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] || character);
}

function brandedEmail(title: string, message: string, text: string): Pick<EmailContent, "html" | "text"> {
  const store = escapeHtml(getEnv().STORE_NAME);
  return {
    html: `<!doctype html><html><body style="margin:0;background:#f6f3eb;font-family:Arial,sans-serif;color:#29352d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden"><tr><td style="padding:28px 32px;background:#e8ede3;color:#52644f;font-size:15px;font-weight:bold;letter-spacing:2px">${store}</td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:28px;font-weight:normal;color:#29352d">${escapeHtml(title)}</h1>${message}<p style="margin:28px 0 0;color:#778074;font-size:13px">With care,<br/>${store}</p></td></tr></table><p style="max-width:560px;color:#778074;font-size:12px;line-height:1.6">This email was sent by ${store}. If you need help, reply to this email.</p></td></tr></table></body></html>`,
    text: `${title}\n\n${text}\n\nWith care,\n${getEnv().STORE_NAME}`,
  };
}

export function otpEmail(purpose: "signup" | "password_reset", code: string, expiryMinutes: number): EmailContent {
  const signup = purpose === "signup";
  const title = signup ? "Verify your email" : "Your password reset code";
  const subject = signup ? `Verify your ${getEnv().STORE_NAME} email` : `Reset your ${getEnv().STORE_NAME} password`;
  const warning = signup
    ? "If you didn't request this, you can safely ignore this email."
    : "If you didn't request a password reset, ignore this email and consider changing your password.";
  const { html, text } = brandedEmail(
    title,
    `<p style="font-size:15px;line-height:1.7;color:#59645b">${signup ? "Use this one-time code to finish creating your account." : "Use this one-time code to verify your password reset request."}</p><div style="margin:24px 0;padding:18px;border-radius:14px;background:#f5f4ed;text-align:center;font-size:34px;font-weight:bold;letter-spacing:10px;color:#52644f">${escapeHtml(code)}</div><p style="font-size:14px;color:#59645b">This code expires in ${expiryMinutes} minutes. ${escapeHtml(warning)}</p>`,
    `${signup ? "Use this code to verify your email:" : "Use this code to verify your password reset request:"} ${code}\nThis code expires in ${expiryMinutes} minutes. ${warning}`,
  );
  return { subject, html, text };
}

export function welcomeEmail(name: string): EmailContent {
  const { html, text } = brandedEmail(
    "Welcome to Decotrin",
    `<p style="font-size:15px;line-height:1.7;color:#59645b">Hello ${escapeHtml(name)}, your account is ready. We’re delighted to be part of your everyday care.</p><p style="font-size:14px;color:#59645b">Explore thoughtful essentials for your skin, hair and body whenever you’re ready.</p>`,
    `Hello ${name}, your account is ready. We’re delighted to be part of your everyday care.`,
  );
  return { subject: `Welcome to ${getEnv().STORE_NAME}`, html, text };
}

export function passwordChangedEmail(): EmailContent {
  const { html, text } = brandedEmail(
    "Your password was changed",
    "<p style=\"font-size:15px;line-height:1.7;color:#59645b\">The password for your account was just changed. If this wasn't you, contact support immediately to secure your account.</p>",
    "The password for your account was just changed. If this wasn't you, contact support immediately to secure your account.",
  );
  return { subject: `Your ${getEnv().STORE_NAME} password was changed`, html, text };
}

export function orderEmail(kind: "confirmation" | "shipped" | "delivered" | "return_status" | "refund_processed", details: string): EmailContent {
  const titles = {
    confirmation: "Order confirmed",
    shipped: "Your order is on its way",
    delivered: "Your order was delivered",
    return_status: "An update on your return",
    refund_processed: "Your refund has been processed",
  };
  const { html, text } = brandedEmail(
    titles[kind],
    `<p style="font-size:15px;line-height:1.7;color:#59645b">${escapeHtml(details)}</p>`,
    details,
  );
  return { subject: `${titles[kind]} | ${getEnv().STORE_NAME}`, html, text };
}
