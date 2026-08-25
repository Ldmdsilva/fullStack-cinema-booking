import { emailLayout } from './layout.js';

/**
 * @param {{ name: string, resetUrl: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function passwordResetTemplate({ name, resetUrl }) {
  const text = `Hi ${name}, a password reset was requested for your Encore Cinemas account. Visit ${resetUrl} to choose a new password. If you didn't request this, you can safely ignore this email — no action will be taken. This link is single-use and time-limited.`;
  const bodyHtml = `
    <p style="color:#F5F1EA;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">
      Hi ${name}, we received a request to reset the password for your Encore Cinemas account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="border-radius:6px;background:#E4B04A;">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0E0C0A;text-decoration:none;border-radius:6px;">
            Reset your password
          </a>
        </td>
      </tr>
    </table>
    <p style="color:#B8B2A7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
      Or copy and paste this link into your browser: ${resetUrl}
    </p>
    <p style="color:#B8B2A7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
      If you didn't request a password reset, you can safely ignore this email — no changes will be made to your account.
      This link is single-use and time-limited.
    </p>
  `;

  return {
    subject: 'Reset your Encore Cinemas password',
    html: emailLayout({ title: 'Reset your password', bodyHtml }),
    text,
  };
}
