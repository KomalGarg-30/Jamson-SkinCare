import nodemailer from "nodemailer";
import { getEnv, requireEnv } from "@/lib/env";

export async function sendEmail(to: string, subject: string, html: string) {
  const env = getEnv();
  const transporter = nodemailer.createTransport({
    host: requireEnv("EMAIL_HOST"),
    port: env.EMAIL_PORT,
    secure: env.EMAIL_PORT === 465,
    auth: { user: requireEnv("EMAIL_USER"), pass: requireEnv("EMAIL_PASSWORD") },
  });
  await transporter.sendMail({ from: requireEnv("EMAIL_FROM"), to, subject, html });
}
