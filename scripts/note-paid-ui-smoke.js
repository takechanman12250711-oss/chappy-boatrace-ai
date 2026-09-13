'use strict';

const { chromium } = require('playwright');
const { fillDraft } = require('./note-browserbase-draft-save');
const {
  configurePaidPublication,
  articleBody,
  EXPECTED_PRICE_YEN,
  createAuthenticatedPage
} = require('./note-github-ui-transport');

const TEST_PAYLOAD = {
  title: '【自動化テスト】note有料設定確認',
  freeText: 'これはnote自動投稿経路の有料設定確認用テスト下書きです。公開はしません。',
  paidText: 'ここから先は有料エリア設定確認用のテスト本文です。',
  price: EXPECTED_PRICE_YEN
};

async function run({ env = process.env } = {}) {
  const browser = await chromium.launch({ headless: false, args: ['--disable-dev-shm-usage'] });
  try {
    const { page } = await createAuthenticatedPage(browser, env);
    console.log('NOTE_PAID_SMOKE_STATE_LOADED=true');
    console.log('NOTE_PAID_SMOKE_EDITOR_READY=true');

    const result = await fillDraft(page, {
      title: TEST_PAYLOAD.title,
      body: articleBody(TEST_PAYLOAD)
    });
    const paid = await configurePaidPublication(page, TEST_PAYLOAD);

    console.log('NOTE_PAID_SMOKE_DRAFT_FILLED=true');
    console.log(`NOTE_PAID_SMOKE_DRAFT_URL=${result.url}`);
    console.log('NOTE_PAID_SMOKE_CONFIGURED=true');
    console.log(`NOTE_PAID_SMOKE_PRICE_YEN=${paid.price}`);
    console.log(`NOTE_PAID_SMOKE_PAID_START=${paid.paidStart}`);
    console.log('NOTE_PAID_SMOKE_PUBLISH_CLICKED=false');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`NOTE_PAID_SMOKE_FAILED=${error.message}`);
    process.exitCode = 1;
  });
}
