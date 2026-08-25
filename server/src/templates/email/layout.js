/**
 * Shared email-safe HTML shell reproducing the Encore ticket-stub design
 * language (docs/encore-design-system.md): ink panel, gold mono eyebrow,
 * serif title. Uses nested tables and inline styles only.
 * @param {{ title: string, bodyHtml: string }} params
 * @returns {string}
 */
export function emailLayout({ title, bodyHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0E0C0A;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E0C0A;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#1A1714;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px 32px;">
                <div style="font-family:'Courier New',Courier,monospace;letter-spacing:2px;text-transform:uppercase;color:#E4B04A;font-size:12px;">Encore</div>
                <h1 style="font-family:Georgia,'Times New Roman',serif;color:#F5F1EA;font-size:22px;margin:8px 0 16px;">${title}</h1>
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * One ticket-stub row: event/venue header, a dashed tear-line, then the
 * seat and price in a mono serial line.
 * @param {{ eventTitle: string, dateLabel: string, venueLabel: string, seat: { section: string, row: string, number: number, price: number }, reference: string }} params
 * @returns {string}
 */
export function ticketStubHtml({ eventTitle, dateLabel, venueLabel, seat, reference }) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid #55504A;border-radius:6px;">
    <tr>
      <td style="padding:14px 16px 10px;color:#F5F1EA;font-family:Georgia,'Times New Roman',serif;font-size:15px;">
        ${eventTitle}
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#B8B2A7;margin-top:4px;">${dateLabel} &middot; ${venueLabel}</div>
      </td>
    </tr>
    <tr>
      <td style="border-top:2px dashed #55504A;font-size:0;line-height:0;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:10px 16px 14px;font-family:'Courier New',Courier,monospace;color:#E4B04A;font-size:13px;">
        Seat ${seat.section} ${seat.row}${seat.number} &middot; Rs ${Number(seat.price).toFixed(2)}<br />
        ${reference}
      </td>
    </tr>
  </table>`;
}
