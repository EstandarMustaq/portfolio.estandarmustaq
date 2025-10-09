// server/server.js
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & parsing
app.use(helmet());
app.use(express.json({limit: '10kb'}));
app.use(express.urlencoded({extended: true}));

// CORS - ajuste FRONTEND_ORIGIN no .env para restringir
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*'
}));

// Rate limiter (evita abuso)
const limiter = rateLimit({
  windowMs: 1000 * 60, // 1 minuto
  max: 10, // max 10 requests por IP por minuto
  message: { success: false, message: 'Muitas requisições, tente novamente mais tarde.' }
});
app.use('/api/', limiter);

// Health
app.get('/api/health', (req, res) => res.json({ok:true, env: process.env.NODE_ENV || 'dev'}));

// POST /api/contact
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Honeypot: se houver campo 'company' (bots), rejeita
    if (req.body.company) {
      return res.status(400).json({ success:false, message:'Validação falhou.' });
    }

    // Basic validation
    if (!name || name.trim().length < 3) return res.status(400).json({ success:false, message:'Nome inválido.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success:false, message:'Email inválido.' });
    if (!message || message.trim().length < 10) return res.status(400).json({ success:false, message:'Mensagem muito curta.' });

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: (process.env.SMTP_SECURE === 'true'), // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Verify transporter (optional)
    await transporter.verify();

    // Email details
    const mailOptions = {
      from: process.env.FROM_EMAIL || `"Portfólio" <${process.env.SMTP_USER}>`,
      to: process.env.TO_EMAIL || process.env.SMTP_USER,
      subject: `Novo contacto do portfólio — ${name}`,
      text: `Nome: ${name}\nEmail: ${email}\n\nMensagem:\n${message}`,
      html: `<p><strong>Nome:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <hr/>
             <p>${message.replace(/\n/g,'<br/>')}</p>`
    };

    // Send
    await transporter.sendMail(mailOptions);

    return res.json({ success: true, message: 'Mensagem enviada com sucesso. Obrigado!' });

  } catch (err) {
    console.error('Error /api/contact:', err);
    return res.status(500).json({ success:false, message: 'Erro ao enviar mensagem, tente novamente mais tarde.' });
  }
});

// Serve static (opcional) - se quiser servir frontend direto do backend
if (process.env.SERVE_STATIC === 'true') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '..', 'public'))); // ajusta conforme estrutura
  app.get('*', (req,res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

