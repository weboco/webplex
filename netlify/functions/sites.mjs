import { timingSafeEqual, randomUUID } from "node:crypto";

// Set these three in Netlify: Site configuration > Environment variables
//   JSONBIN_ID   the ID of your JSONBin bin
//   JSONBIN_KEY  your JSONBin Master Key
//   ADMIN_CODE   the secret code you type to unlock editing
const BASE = "https://api.jsonbin.io/v3/b/";

const headers = { "content-type": "application/json", "cache-control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

function codeOk(input) {
  const real = process.env.ADMIN_CODE || "";
  if (!real || typeof input !== "string") return false;
  const a = Buffer.from(input);
  const b = Buffer.from(real);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanUrl(value) {
  try {
    const u = new URL(String(value).trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

function clean(list) {
  if (!Array.isArray(list) || list.length > 100) return null;
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object") return null;
    const name = String(s.name ?? "").trim().slice(0, 60);
    const url = cleanUrl(s.url);
    if (!name || !url) return null;
    out.push({
      id: String(s.id ?? "").slice(0, 60) || randomUUID(),
      name,
      url,
      desc: String(s.desc ?? "").trim().slice(0, 140),
      emoji: String(s.emoji ?? "").trim().slice(0, 8),
    });
  }
  return out;
}

async function readSites() {
  const r = await fetch(`${BASE}${process.env.JSONBIN_ID}/latest`, {
    headers: { "X-Master-Key": process.env.JSONBIN_KEY, "X-Bin-Meta": "false" },
  });
  if (!r.ok) throw new Error("read failed " + r.status);
  const data = await r.json();
  const rec = data && data.record ? data.record : data;
  return Array.isArray(rec?.sites) ? rec.sites : [];
}

async function writeSites(sites) {
  const r = await fetch(`${BASE}${process.env.JSONBIN_ID}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "X-Master-Key": process.env.JSONBIN_KEY },
    body: JSON.stringify({ sites }),
  });
  if (!r.ok) throw new Error("write failed " + r.status);
}

export default async (req) => {
  if (!process.env.JSONBIN_ID || !process.env.JSONBIN_KEY) {
    return json({ error: "Set JSONBIN_ID and JSONBIN_KEY in Netlify, then redeploy." }, 500);
  }

  if (req.method === "GET") {
    try {
      return json({ sites: await readSites() });
    } catch {
      return json({ error: "Couldn't load the list." }, 502);
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }
    if (!process.env.ADMIN_CODE) return json({ error: "Set ADMIN_CODE in Netlify, then redeploy." }, 500);
    if (!codeOk(body.code)) return json({ error: "Wrong code" }, 401);

    if (body.action === "verify") return json({ ok: true });

    if (body.action === "save") {
      const sites = clean(body.sites);
      if (!sites) return json({ error: "Each website needs a name and a valid web address." }, 400);
      try {
        await writeSites(sites);
      } catch {
        return json({ error: "Couldn't save to the JSON file. Try again." }, 502);
      }
      return json({ sites });
    }
    return json({ error: "Unknown action" }, 400);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/sites" };
