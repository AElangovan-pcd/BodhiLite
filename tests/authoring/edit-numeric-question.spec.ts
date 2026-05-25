import { test, expect } from '@playwright/test';
import { adminClient, createTestUserClient, deleteTestUser } from '../helpers/auth';
import { signInBrowser } from '../helpers/browser-session';

test('instructor authors a parameterized numeric question end-to-end', async ({
  page,
  context,
}) => {
  const admin = adminClient();
  const instr = await createTestUserClient({
    email: `instr-num+${Date.now()}@test.local`,
    password: 'test-pw-1!',
    role: 'instructor',
  });
  try {
    const { data: a } = await admin
      .from('assessments')
      .insert({ owner_user_id: instr.userId, title: 'Stoich', slug: 'stoich', status: 'draft' })
      .select('id')
      .single();
    const { data: q } = await admin
      .from('questions')
      .insert({
        assessment_id: a!.id,
        position: 1,
        type: 'numeric',
        body: { stem: '' },
        scoring: { formula: '0', tolerance: 0 },
      })
      .select('id')
      .single();

    await signInBrowser(context, instr);
    await page.goto(`/assessments/${a!.id}/questions/${q!.id}`);

    // Type a stem + a randint variable + a formula
    await page.getByLabel(/stem/i).fill('How many g of NaCl for {{moles}} mol?');
    await page.getByRole('button', { name: /\+ Add variable/i }).click();
    await page.getByLabel(/Variable 1 name/i).fill('moles');
    // Expand Configure to set min/max
    // The Configure button text includes an arrow prefix; match by contained text
    await page.getByRole('button', { name: /Configure/i }).click();
    // Min and Max labels in RandintSpec are not linked via htmlFor; target by
    // their position within the expanded spec panel (#vspec-0)
    const specPanel = page.locator('#vspec-0');
    // spinbutton inputs: min(0), max(1), step(2)
    await specPanel.getByRole('spinbutton').nth(0).fill('1');
    await specPanel.getByRole('spinbutton').nth(1).fill('5');
    // Set formula and tolerance
    await page.getByLabel(/Grading formula/i).fill('moles * 58.44');
    await page.getByLabel(/Tolerance/i).fill('0.05');

    // Save — button is enabled because the draft is dirty
    await page.getByRole('button', { name: /^Save$/i }).click();

    // Reload and verify persisted
    await page.reload();
    await expect(page.getByLabel(/stem/i)).toHaveValue(/How many g of NaCl/);
    await expect(page.getByLabel(/Grading formula/i)).toHaveValue('moles * 58.44');
  } finally {
    await deleteTestUser(instr.userId);
  }
});
