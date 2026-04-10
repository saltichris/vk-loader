const express = require('express');
const { chromium } = require('playwright');

const app = express();

const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL || 'https://vkvideo.ru/@football8x8/lives';

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function fetchVkMatches() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 2200 }
  });

  try {
    await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    await page.waitForTimeout(4000);

    // Несколько прокруток вниз, чтобы VK догрузил больше карточек
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(1500);
    }

    await page.waitForSelector('[data-testid="catalog_item_video"]', {
      timeout: 30000
    });

    const rows = await page.evaluate(() => {
      const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

      const cards = [...document.querySelectorAll('[data-testid="catalog_item_video"]')];

      const raw = cards.map(card => {
        const a = card.querySelector('a[href*="/video-"]');
        if (!a) return null;

        const titleWrap = card.querySelector('[data-testid="video_card_title"]') || a;
        const title = clean(titleWrap.innerText || titleWrap.textContent || '');
        const url = clean(a.href || '');

        if (!title || !url) return null;

        return { title, url };
      }).filter(Boolean);

      const uniq = [];
      const seen = new Set();

      for (const item of raw) {
        const key = `${item.title}|||${item.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniq.push(item);
        }
      }

      return uniq;
    });

    return rows;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'vk-railway-loader'
  });
});

app.get('/api/vk-matches', async (req, res) => {
  try {
    const rows = await fetchVkMatches();
    res.json({
      ok: true,
      count: rows.length,
      source: TARGET_URL,
      items: rows
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});