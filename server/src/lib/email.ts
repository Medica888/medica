import nodemailer from 'nodemailer';
import { config } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface IEmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class InMemoryEmailSender implements IEmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class SmtpEmailSender implements IEmailSender {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost ?? 'localhost',
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: config.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

let _sender: IEmailSender | null = null;

export function getEmailSender(): IEmailSender {
  if (!_sender) _sender = new SmtpEmailSender();
  return _sender;
}

export function setEmailSender(s: IEmailSender): void {
  _sender = s;
}
