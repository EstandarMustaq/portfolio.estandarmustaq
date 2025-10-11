const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const FROM_EMAIL = process.env.FROM_EMAIL;
const TO_EMAIL = process.env.TO_EMAIL || process.env.SMTP_USER;

async function getTransporter() {
  if (global.__transporter) return global.__transporter;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: (process.env.SMTP_SECURE === 'true'),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  global.__transporter = transporter;
  return transporter;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function findLogoLocal() {
  const candidates = [
    path.join(process.cwd(), 'public', 'img', 'favicon.ico'),
    path.join(process.cwd(), 'public', 'img', 'logo-icons0.png')
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { name, email, message, company } = req.body || {};

    // honeypot
    if (company) return res.status(400).json({ success: false, message: 'Validação falhou.' });

    // basic validation
    if (!name || name.trim().length < 3) return res.status(400).json({ success: false, message: 'Nome inválido.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Email inválido.' });
    if (!message || message.trim().length < 10) return res.status(400).json({ success: false, message: 'Mensagem muito curta.' });

    const transporter = await getTransporter();

    const logoPath = findLogoLocal();
    const attachments = [];
    if (logoPath) attachments.push({ filename: path.basename(logoPath), path: logoPath, cid: 'portfolio_logo' });

    const from = FROM_EMAIL || `"Portfólio" <${process.env.SMTP_USER}>`;
    const to = TO_EMAIL;

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Novo contacto</title></head>
    <body style="margin:0;padding:0;background:#0b0f14;color:#e6eef8;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#071019;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.04);box-shadow:0 10px 30px rgba(0,0,0,0.6);">
      <tr><td style="padding:48px 48px;text-align:center;">
      ${logoPath ? `<img src="cid:portfolio_logo" alt="logo" width="64" height="64" style="display:block;margin:0 auto 14px;border-radius:8px" />` : ''}
      <h1 style="font-size:20px;margin:0 0 6px;color:#d7b6ff;font-weight:700;">Novo contacto do portfólio</h1>
      <p style="margin:6px 0 0;color:#9fcbd1;font-size:14px;">Mensagem recebida através do formulário de contacto</p>
      </td></tr>
      <tr><td style="padding:0 20px 18px;">
      <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-radius:10px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03);">
      <tr><td style="width:120px;vertical-align:top;padding:12px 14px;font-weight:700;color:#b8dfe0">Nome</td><td style="vertical-align:top;padding:12px 14px;color:#e6eef8">${escapeHtml(name)}</td></tr>
      <tr><td style="vertical-align:top;padding:12px 14px;font-weight:700;color:#b8dfe0">Email</td><td style="vertical-align:top;padding:12px 14px;color:#e6eef8"><a href="mailto:${escapeHtml(email)}" style="color:#9fe8d6;text-decoration:none">${escapeHtml(email)}</a></td></tr>
      <tr><td style="vertical-align:top;padding:12px 14px;font-weight:700;color:#b8dfe0">Assunto</td><td style="vertical-align:top;padding:12px 14px;color:#e6eef8">Contacto pelo Portfólio</td></tr>
      </table></td></tr>
      <tr><td style="padding:0 20px 18px;"><div style="background:rgba(255,255,255,0.02);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.03);color:#cfeff2;line-height:1.5;white-space:pre-wrap;">${escapeHtml(message)}</div></td></tr>
      <tr><td style="padding:14px 20px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:12px;color:#98a8b0;padding:6px 0;"><strong>Reply-To:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#9fe8d6;text-decoration:none">${escapeHtml(email)}</a></td>
      <td style="text-align:right;font-size:12px;color:#98a8b0;padding:6px 0;">Enviado: ${new Date().toLocaleString()}</td></tr></table>
      <hr style="border:none;height:1px;background:rgba(255,255,255,0.03);margin:12px 0" />
      <p style="margin:0;font-size:12px;color:#7f8b8f">Recebeste este e-mail porque alguém contactou-te através do formulário do teu portfólio.</p>
      </td></tr></table></td></tr></table></body></html>`;

    const text = `Novo contacto — ${name}\n\nDe: ${email}\nAssunto: Contacto pelo Portfólio\n\nMensagem:\n${message}\n\nReply-To: ${email}\nEnviado: ${new Date().toISOString()}\n\n----------------------------------------\nRecebeste este e-mail porque alguém contactou-te através do formulário do teu portfólio.`;

    const mailOptions = {
      from,
      to,
      subject: `Novo contacto do portfólio — ${name}`,
      text,
      html,
      replyTo: email,
      attachments
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ success: true, message: 'Mensagem enviada com sucesso. Obrigado!' });
  } catch (err) {
    console.error('API /contact error', err);
    return res.status(500).json({ success: false, message: 'Erro ao enviar a mensagem, tente novamente mais tarde.' });
  }
};

