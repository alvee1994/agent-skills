#!/usr/bin/env node
'use strict';

/**
 * Fills and submits a login form using credentials injected by `aac run` into
 * this process's environment. Never reads credentials from CLI args, config,
 * or disk, and never logs/writes their values.
 */

const { chromium } = require('playwright');

async function main() {
  const loginUrl = process.env.LOGIN_URL;
  const username = process.env.AAC_USERNAME;
  const password = process.env.AAC_PASSWORD;

  if (!loginUrl) {
    console.error('Login failed: LOGIN_URL is not set.');
    process.exit(1);
  }
  if (!username || !password) {
    console.error('Login failed: credentials not present in environment (expected AAC_USERNAME and AAC_PASSWORD).');
    process.exit(1);
  }

  const userSelector = process.env.LOGIN_USER_SELECTOR || '#username';
  const passSelector = process.env.LOGIN_PASS_SELECTOR || '#password';
  const submitSelector = process.env.LOGIN_SUBMIT_SELECTOR || '#submit';
  const successSelector = process.env.LOGIN_SUCCESS_SELECTOR || null;
  const headless = process.env.HEADFUL !== 'true';

  let browser;
  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

    await page.fill(userSelector, username);
    await page.fill(passSelector, password);

    if (successSelector) {
      await Promise.all([
        page.waitForSelector(successSelector, { timeout: 30000 }),
        page.click(submitSelector),
      ]);
    } else {
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }),
        page.click(submitSelector),
      ]);
    }

    console.log('Login successful');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`Login failed: ${err && err.message ? err.message.split('\n')[0] : 'unknown error'}`);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {
        // ignore
      }
    }
    process.exit(1);
  }
}

main();
