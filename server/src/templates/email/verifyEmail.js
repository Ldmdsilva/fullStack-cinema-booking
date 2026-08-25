import { emailLayout } from './layout.js';

/**
 * @param {{ name: string, verifyUrl: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function verifyEmailTemplate({ name, verifyUrl }) {
  const text = `Hi ${name}, please confirm your Encore Cinemas account by visiting: ${verifyUrl}. This link will expire shortly, so verify soon.`;
  const bodyHtml = `
    <p style="color:#F5F1EA;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">
      Hi ${name}, thanks for signing up. Please confirm this email address to finish setting up your Encore Cinemas account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="border-radius:6px;background:#E4B04A;">
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0E0C0A;text-decoration:none;border-radius:6px;">
            Verify email address
          </a>
        </td>
      </tr>
    </table>
    <p style="color:#B8B2A7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
      Or copy and paste this link into your browser: ${verifyUrl}
    </p>
    <p style="color:#B8B2A7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
      This link will expire shortly. If you didn't create an Encore Cinemas account, you can ignore this email.
    </p>
  `;

  return {
    subject: 'Verify your Encore Cinemas account',
    html: emailLayout({ title: 'Confirm your email', bodyHtml }),
    text,
  };
}
