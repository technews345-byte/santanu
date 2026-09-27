import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

let transport;
export const mailConfigured = () => !!(config.smtp.host && config.smtp.from);
export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) { log.warn('email not sent: SMTP is not configured', { to, subject }); return false; }
  transport ||= nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined });
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
  return true;
}
