'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs').promises;

/**
 * Safe env keys to show in the payload (not secrets).
 */
const SAFE_ENV_KEYS = ['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL'];

// Safe snapshot of a few env vars
function getSafeEnv() {
  const out = {};
  for (const k of SAFE_ENV_KEYS) {
    if (process.env[k] !== undefined) out[k] = process.env[k];
  }
  return out;
}

// Read package.json safely (name + version)
async function readPackageInfo() {
  try {
    const pjsonPath = path.join(process.cwd(), 'package.json');
    const raw = await fs.readFile(pjsonPath, 'utf8');
    const pj = JSON.parse(raw);
    return { name: pj.name, version: pj.version };
  } catch (e) {
    return { name: null, version: null };
  }
}

// Deep check: SMTP verify (only when asked)
async function checkSmtp(timeoutMs = 4000) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { ok: null, reason: 'SMTP not configured' };
  }
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    return { ok: null, reason: 'nodemailer not installed' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: (String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    tls: { minVersion: 'TLSv1.2' }
  });

  const start = Date.now();
  const verifyPromise = transporter.verify();

  // timeout guard
  const race = Promise.race([
    verifyPromise.then(() => ({ ok: true, durationMs: Date.now() - start })),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
  ]);

  try {
    return await race;
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}

/**
 * Extract Vercel region and instanceId from header "x-vercel-id" (format seen: cpt1::iad1::instance)
 * Fallback to process.env.VERCEL_REGION or null.
 */
function extractVercelInfoFromHeader(req) {
  const header = (req && req.headers && (req.headers['x-vercel-id'] || req.headers['x-now-id'])) || null;
  if (!header) return { raw: null, region: process.env.VERCEL_REGION || null, instanceId: null };

  try {
    const parts = String(header).split('::').filter(Boolean); // removes empty entries
    const len = parts.length;
    const instanceId = len >= 1 ? parts[len - 1] : null;
    const region = len >= 2 ? parts[len - 2] : (process.env.VERCEL_REGION || null);

    return { raw: String(header), region, instanceId };
  } catch (e) {
    return { raw: String(header), region: process.env.VERCEL_REGION || null, instanceId: null };
  }
}


/**
 * Compose vercel/deployment info safely from headers + envs
 */
function getVercelMeta(req) {
  const hdr = extractVercelInfoFromHeader(req);

  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ||
                       process.env.VERCEL_GIT_COMMIT_SHA ||
                       process.env.VERCEL_GITHUB_COMMIT_SHA ||
                       null;

  const url = process.env.VERCEL_URL || null;
  const gitRef = process.env.VERCEL_GIT_COMMIT_REF || process.env.VERCEL_GIT_BRANCH || null;

  return {
    region: hdr.region,
    instanceId: hdr.instanceId,
    xVercelIdRaw: hdr.raw,
    deploymentId,
    url,
    gitRef
  };
}

module.exports = async (req, res) => {
  // Allow OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,HEAD,OPTIONS,POST');
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET,HEAD,OPTIONS,POST');
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const uptimeSec = process.uptime();
  const mem = process.memoryUsage();
  const pkg = await readPackageInfo();

  const vercelMeta = getVercelMeta(req);

  const payload = {
    ok: true,
    timestamp: nowIso,
    uptime: Math.round(uptimeSec),
    node: process.version,
    os: `${os.type()} ${os.arch()}`,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB'
    },
    service: {
      name: pkg.name || null,
      version: pkg.version || null
    },
    env: getSafeEnv(),
    vercel: vercelMeta
  };

  // Echo important Vercel headers for correlation (if available)
  if (vercelMeta && vercelMeta.xVercelIdRaw) {
    res.setHeader('x-vercel-id', vercelMeta.xVercelIdRaw);
  }
  if (vercelMeta && vercelMeta.deploymentId) {
    res.setHeader('x-vercel-deployment-id', String(vercelMeta.deploymentId));
  }
  if (vercelMeta && vercelMeta.url) {
    res.setHeader('x-vercel-url', String(vercelMeta.url));
  }

  // Add health-check timestamp header
  res.setHeader('x-health-check-time', nowIso);

  // Determine whether deep checks are requested (explicit)
  const wantDeep = (req.method === 'POST' && req.body && req.body.deep) ||
                   (req.query && (req.query.deep === '1' || req.query.deep === 'true'));

  if (!wantDeep) {
    // short cache for monitoring pings
    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
    return res.status(200).json(payload);
  }

  // deep checks - no cache
  res.setHeader('Cache-Control', 'no-store');

  const checks = { smtp: null };

  try {
    checks.smtp = await checkSmtp(4000);
  } catch (err) {
    checks.smtp = { ok: false, reason: err && err.message ? err.message : String(err) };
  }

  payload.checks = checks;
  if (checks.smtp && checks.smtp.ok === false) payload.ok = false;

  return res.status(payload.ok ? 200 : 502).json(payload);
};
