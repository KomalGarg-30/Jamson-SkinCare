import { Resend } from "resend";
import { after } from "next/server";
import { getEmailConfig } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({ to, subject, html, text }: EmailMessage) {
  try {
    const env = getEmailConfig();
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    });
    if (error) {
      console.error("Email delivery failed through Resend.", { name: error.name, statusCode: error.statusCode });
      throw new Error("We couldn't send that email. Please try again in a moment.");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "We couldn't send that email. Please try again in a moment.") throw error;
    if (error instanceof Error && error.message.startsWith("Email is not configured.")) throw error;
    console.error("Email delivery failed through Resend.", { name: error instanceof Error ? error.name : "UnknownError" });
    throw new Error("We couldn't send that email. Please try again in a moment.");
  }
}

export function sendEmailAfterResponse(message: EmailMessage) {
  after(async () => {
    try {
      await sendEmail(message);
    } catch (error) {
      console.error("Background email delivery failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    }
  });
}
