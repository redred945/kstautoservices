#!/usr/bin/env node
/* ==========================================================================
   KST Auto Loc’ — images de partage des pages véhicule
   --------------------------------------------------------------------------
   Capture og-vehicle.html#<slug> (équivalent de ?v=<slug>) à 1200×630 (deviceScaleFactor 2, puis réduction)
   et écrit assets/img/og/<slug>.jpg, comme og.jpg pour l'accueil.

   Prérequis (hors dépôt, rien n'est ajouté au site) :
     npm i --no-save playwright-core sharp        (Edge ou Chrome installé)
   Le site doit être servi en local, par exemple :
     npx serve -l 4760 .
   Usage :
     node tools/capture-og.mjs [slug …]            (sans argument : les 7 véhicules)
   Variables : OG_BASE (défaut http://localhost:4760), OG_MODULES (dossier node_modules
   contenant playwright-core et sharp, si ce n'est pas celui du dépôt), OG_CHANNEL (msedge).
   ========================================================================== */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.OG_MODULES ? join(process.env.OG_MODULES, 'x.js') : import.meta.url);
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const BASE = process.env.OG_BASE || 'http://localhost:4760';
const ALL = ['rolls-royce-ghost', 'mercedes-classe-s-maybach', 'mercedes-classe-g-63-amg', 'mercedes-gle-coupe-43-amg', 'porsche-cayenne-coupe', 'maserati-ghibli', 'mercedes-classe-c'];
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

mkdirSync(join(ROOT, 'assets/img/og'), { recursive: true });
const browser = await chromium.launch({ channel: process.env.OG_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
for (const slug of slugs) {
  await page.goto('about:blank');   // force un vrai rechargement (un simple changement de #hash ne relance pas le script)
  await page.goto(`${BASE}/og-vehicle.html#${slug}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const png = await page.screenshot();
  const out = join(ROOT, 'assets/img/og', `${slug}.jpg`);
  await sharp(png).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
  console.log('  ' + out.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
}
await browser.close();
