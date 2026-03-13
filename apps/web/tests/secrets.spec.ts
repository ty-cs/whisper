import { expect, type Page, test } from '@playwright/test';

// ─── Helper ──────────────────────────────────────────────────────────────────

interface SecretOptions {
  text: string;
  password?: string;
  burnAfterReading?: boolean;
  maxViews?: number;
  expiresIn?: '5m' | '1h' | '24h' | '7d' | '30d';
}

/**
 * Fills and submits the create-secret form, then returns the shareable URL
 * by reading it directly from the displayed URL div on the success page.
 */
async function createSecretAndGetUrl(
  page: Page,
  opts: SecretOptions,
): Promise<string> {
  await page.goto('/');
  // Click before fill ensures React's onChange fires reliably in all browsers (esp. WebKit).
  await page.locator('#text').click();
  await page.locator('#text').fill(opts.text);

  if (opts.expiresIn) {
    await page.locator('#expiresIn').selectOption(opts.expiresIn);
  }

  if (opts.burnAfterReading) {
    await page.getByRole('button', { name: /BURN_AFTER_READING/ }).click();
  } else if (opts.maxViews !== undefined && opts.maxViews > 0) {
    await page.locator('#maxViews').fill(String(opts.maxViews));
  }

  if (opts.password) {
    await page.locator('#password').fill(opts.password);
  }

  await page.getByRole('button', { name: /ENCRYPT/ }).click();
  await expect(page.getByText('ENCRYPTION SUCCESSFUL')).toBeVisible();

  // Read URL from the DOM — the share URL is rendered in a div on the success page.
  const shareUrl = await page.getByTestId('share-url').textContent();
  return shareUrl?.trim() ?? '';
}

// ─── Form: create page ────────────────────────────────────────────────────────

test.describe('Create secret form', () => {
  test('renders form fields with correct defaults', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#text')).toBeVisible();
    await expect(page.locator('#expiresIn')).toHaveValue('24h');
    await expect(page.locator('#maxViews')).toHaveValue('0');
    await expect(page.locator('#password')).toBeVisible();
  });

  test('ENCRYPT button is disabled when textarea is empty', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /ENCRYPT/ })).toBeDisabled();
  });

  test('ENCRYPT button enables once text is entered', async ({ page }) => {
    await page.goto('/');
    await page.locator('#text').fill('hello');
    await expect(page.getByRole('button', { name: /ENCRYPT/ })).toBeEnabled();
  });

  test('burn-after-reading toggle locks maxViews to 1', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /BURN_AFTER_READING/ }).click();

    await expect(page.locator('#maxViews')).toHaveValue('1');
    await expect(page.locator('#maxViews')).toBeDisabled();
  });

  test('toggling burn-after-reading off resets maxViews to 0', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /BURN_AFTER_READING/ }).click();
    await page.getByRole('button', { name: /BURN_AFTER_READING/ }).click();

    await expect(page.locator('#maxViews')).toHaveValue('0');
    await expect(page.locator('#maxViews')).toBeEnabled();
  });

  test('all expiry options are available', async ({ page }) => {
    await page.goto('/');
    const select = page.locator('#expiresIn');

    await expect(select.locator('option[value="5m"]')).toHaveCount(1);
    await expect(select.locator('option[value="1h"]')).toHaveCount(1);
    await expect(select.locator('option[value="24h"]')).toHaveCount(1);
    await expect(select.locator('option[value="7d"]')).toHaveCount(1);
    await expect(select.locator('option[value="30d"]')).toHaveCount(1);
  });
});

// ─── Happy path: plain secret ─────────────────────────────────────────────────

test.describe('Plain secret lifecycle', () => {
  test('create → view → read decrypted content', async ({ page }) => {
    const secretText = `my-plain-secret-${Date.now()}`;
    const shareUrl = await createSecretAndGetUrl(page, { text: secretText });

    expect(shareUrl).toMatch(/\/s\/[\w-]+#/);

    await page.goto(shareUrl);
    await expect(page.getByText('DECRYPTED')).toBeVisible();
    await expect(page.locator('textarea[readonly]')).toHaveValue(secretText);
  });

  test('copy contents copies plaintext to clipboard', async ({ page }) => {
    const secretText = `copy-test-${Date.now()}`;
    const shareUrl = await createSecretAndGetUrl(page, { text: secretText });

    await page.goto(shareUrl);
    await expect(page.locator('textarea[readonly]')).toBeVisible();

    // Intercept clipboard.writeText to capture the value without needing clipboard permissions.
    // Works in all browsers (Chromium, Firefox, WebKit).
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__clipboardData = '';
      navigator.clipboard.writeText = async (text: string) => {
        (window as unknown as Record<string, unknown>).__clipboardData = text;
      };
    });

    await page.getByRole('button', { name: /COPY_CONTENTS/ }).click();

    const copied = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__clipboardData,
    );
    expect(copied).toBe(secretText);
  });

  test('destroy secret redirects to home', async ({ page }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `to-be-destroyed-${Date.now()}`,
    });

    await page.goto(shareUrl);
    await expect(page.locator('textarea[readonly]')).toBeVisible();

    await page.getByRole('button', { name: /DESTROY_AND_LEAVE/ }).click();
    await expect(page).toHaveURL('/');
  });

  test('viewing a destroyed secret shows ACCESS DENIED', async ({
    page,
    browser,
  }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `destroy-then-view-${Date.now()}`,
    });

    // First visit: view and destroy
    await page.goto(shareUrl);
    await expect(page.locator('textarea[readonly]')).toBeVisible();
    await page.getByRole('button', { name: /DESTROY_AND_LEAVE/ }).click();
    await expect(page).toHaveURL('/');

    // Second visit in a fresh context — avoids TanStack Query cache.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(shareUrl);
    await expect(page2.getByText('FATAL: ACCESS DENIED')).toBeVisible();
    await ctx2.close();
  });

  test('create another resets the form', async ({ page }) => {
    await createSecretAndGetUrl(page, { text: `reset-test-${Date.now()}` });

    await page.getByRole('button', { name: /NEW_SECRET/ }).click();

    await expect(page.locator('#text')).toHaveValue('');
    await expect(page.locator('#password')).toHaveValue('');
    await expect(page.getByText('ENCRYPTION SUCCESSFUL')).not.toBeVisible();
  });
});

// ─── Password-protected secrets ───────────────────────────────────────────────

test.describe('Password-protected secret lifecycle', () => {
  test('create → view with correct password → decrypted', async ({ page }) => {
    const secretText = `password-secret-${Date.now()}`;
    const password = 'hunter2';
    const shareUrl = await createSecretAndGetUrl(page, {
      text: secretText,
      password,
    });

    await page.goto(shareUrl);
    await expect(page.getByText('SECURE_VAULT_FOUND')).toBeVisible();

    await page.locator('input[placeholder="********"]').fill(password);
    await page.getByRole('button', { name: /UNLOCK_VAULT/ }).click();

    await expect(page.getByText('DECRYPTED')).toBeVisible();
    await expect(page.locator('textarea[readonly]')).toHaveValue(secretText);
  });

  test('wrong password shows FATAL error', async ({ page }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `wrong-pw-test-${Date.now()}`,
      password: 'correct-horse',
    });

    await page.goto(shareUrl);
    await expect(page.getByText('SECURE_VAULT_FOUND')).toBeVisible();

    await page.locator('input[placeholder="********"]').fill('wrong-password');
    await page.getByRole('button', { name: /UNLOCK_VAULT/ }).click();

    await expect(page.locator('text=/FATAL:/').first()).toBeVisible();
  });

  test('error clears when password input changes', async ({ page }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `clear-error-test-${Date.now()}`,
      password: 'secret123',
    });

    await page.goto(shareUrl);
    const pwInput = page.locator('input[placeholder="********"]');
    await pwInput.fill('wrongpass');
    await page.getByRole('button', { name: /UNLOCK_VAULT/ }).click();

    await expect(page.locator('text=/FATAL:/').first()).toBeVisible();

    // Typing into the password field should clear the error
    await pwInput.fill('');
    await expect(page.locator('text=/FATAL:/').first()).not.toBeVisible();
  });

  test('UNLOCK_VAULT button disabled when password is empty', async ({
    page,
  }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `unlock-disabled-${Date.now()}`,
      password: 'somepass',
    });

    await page.goto(shareUrl);
    await expect(page.getByText('SECURE_VAULT_FOUND')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /UNLOCK_VAULT/ }),
    ).toBeDisabled();
  });
});

// ─── Burn after reading ───────────────────────────────────────────────────────

test.describe('Burn after reading', () => {
  test('DESTROYED badge visible on first view', async ({ page }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `burn-me-${Date.now()}`,
      burnAfterReading: true,
    });

    await page.goto(shareUrl);
    await expect(page.getByText('DECRYPTED')).toBeVisible();
    await expect(page.getByText('DESTROYED', { exact: true })).toBeVisible();
  });

  test('secret is inaccessible after first view', async ({ page, browser }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `burn-once-${Date.now()}`,
      burnAfterReading: true,
    });

    // First view
    await page.goto(shareUrl);
    await expect(page.locator('textarea[readonly]')).toBeVisible();

    // Second visit in a fresh context — avoids TanStack Query cache from the first view.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(shareUrl);
    await expect(page2.getByText('FATAL: ACCESS DENIED')).toBeVisible();
    await ctx2.close();
  });
});

// ─── Max views ────────────────────────────────────────────────────────────────

test.describe('Max views', () => {
  test('DESTROYED badge shown when view count reaches max', async ({
    page,
  }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `max-views-test-${Date.now()}`,
      maxViews: 1,
    });

    await page.goto(shareUrl);
    await expect(page.getByText('DECRYPTED')).toBeVisible();
    await expect(page.getByText('DESTROYED', { exact: true })).toBeVisible();
  });

  test('secret is inaccessible after max views exceeded', async ({
    page,
    browser,
  }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `max-views-access-${Date.now()}`,
      maxViews: 1,
    });

    // First view (consumes the only allowed view)
    await page.goto(shareUrl);
    await expect(page.locator('textarea[readonly]')).toBeVisible();

    // Second visit in a fresh context — avoids TanStack Query cache from the first view.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(shareUrl);
    await expect(page2.getByText('FATAL: ACCESS DENIED')).toBeVisible();
    await ctx2.close();
  });
});

// ─── Expiry ───────────────────────────────────────────────────────────────────

test.describe('Expiry options', () => {
  for (const value of ['5m', '1h', '24h', '7d', '30d'] as const) {
    test(`creates a secret with expiry ${value} and it is viewable`, async ({
      page,
    }) => {
      const secretText = `expiry-${value}-${Date.now()}`;
      const shareUrl = await createSecretAndGetUrl(page, {
        text: secretText,
        expiresIn: value,
      });

      await page.goto(shareUrl);
      await expect(page.getByText('DECRYPTED')).toBeVisible();
      await expect(page.locator('textarea[readonly]')).toHaveValue(secretText);
    });
  }
});

// ─── Payload size guard ───────────────────────────────────────────────────────

test.describe('Payload size guard', () => {
  test('shows error toast when input exceeds 700 KB', async ({ page }) => {
    await page.goto('/');

    // Generate a string just over 700 KB
    const oversized = 'a'.repeat(700 * 1024 + 1);
    await page.locator('#text').fill(oversized);
    await page.getByRole('button', { name: /ENCRYPT/ }).click();

    await expect(page.getByText(/Payload too large/i)).toBeVisible();
    // Should not navigate away — form stays on the create page
    await expect(page.locator('#text')).toBeVisible();
  });

  test('does not block normal-sized input', async ({ page }) => {
    await page.goto('/');

    await page.locator('#text').click();
    await page
      .locator('#text')
      .fill('small secret that is well under the limit');
    await page.getByRole('button', { name: /ENCRYPT/ }).click();

    await expect(page.getByText('ENCRYPTION SUCCESSFUL')).toBeVisible();
  });
});

// ─── Error states ─────────────────────────────────────────────────────────────

test.describe('Error states', () => {
  test('nonexistent secret ID shows ACCESS DENIED', async ({ page }) => {
    await page.goto('/s/this-id-does-not-exist#fakekeyfakekeyfakekey');
    await expect(page.getByText('FATAL: ACCESS DENIED')).toBeVisible();
  });

  test('RETURN_TO_BASE link navigates home', async ({ page }) => {
    await page.goto('/s/nonexistent#fakekeyfakekeyfakekey');
    await expect(page.getByText('FATAL: ACCESS DENIED')).toBeVisible();

    await page.getByRole('link', { name: /RETURN_TO_BASE/ }).click();
    await expect(page).toHaveURL('/');
  });

  test('missing URL fragment causes decryption error', async ({ page }) => {
    const shareUrl = await createSecretAndGetUrl(page, {
      text: `fragment-test-${Date.now()}`,
    });
    // Strip the # fragment
    const urlWithoutFragment = shareUrl.split('#')[0];

    await page.goto(urlWithoutFragment);
    await expect(page.getByText('FATAL: DECRYPTION FAILED')).toBeVisible();
  });
});
