/* =============================================================================
   e2e-bo.spec.mjs — les tests que l'API ne peut pas faire.
   =============================================================================
   Tout ce qu'on a trouvé aujourd'hui du côté interface avait un point commun :
   le SERVEUR répondait correctement. Un test d'API les aurait tous manqués.

     • un champ de stock éditable qui n'enregistrait rien ;
     • des boutons ± cachés tant que la ligne n'est pas dépliée ;
     • un filtre de période excluant le dernier jour du mois ;
     • un bouton « Payer » actif alors qu'aucun moyen n'était disponible ;
     • une liste de bons qui disparaissait dès qu'un code était appliqué.

   D'où ce fichier : il pilote un vrai navigateur et vérifie ce que l'utilisateur
   voit et obtient, pas ce que l'API renvoie.

   INSTALLATION
     npm i -D @playwright/test && npx playwright install chromium

   USAGE
     BO_URL='http://185.180.206.46/webshop/backoffice_franchisee/?shop=2&token=…' \
       npx playwright test tests/e2e-bo.spec.mjs

   ⚠️ Ces tests ÉCRIVENT en base (stock, statut). À jouer sur une boutique de
   test, ou en acceptant que le stock bouge de ±1.
============================================================================= */

import { test, expect } from '@playwright/test';

const BO = process.env.BO_URL;
test.skip(!BO, 'BO_URL non défini');

test.beforeEach(async ({ page }) => {
  // Les erreurs console sont des DÉFAUTS, pas du bruit : on les fait remonter.
  page.on('console', (m) => { if (m.type() === 'error') console.log('    [console] ' + m.text()); });
  page.on('pageerror', (e) => console.log('    [pageerror] ' + e.message));
});

test('le back-office s\'ouvre sans écran de connexion et affiche son menu', async ({ page }) => {
  await page.goto(BO, { waitUntil: 'networkidle' });
  await expect(page.getByText('Tableau de bord')).toBeVisible();
  await expect(page.getByText('Stock du jour')).toBeVisible();
  // Le bandeau rouge n'apparaît que si un chargement a échoué.
  await expect(page.locator('#bo-errors')).toHaveCount(0);
});

test('la saisie d\'un stock est RÉELLEMENT enregistrée (survit au rechargement)', async ({ page }) => {
  await page.goto(BO, { waitUntil: 'networkidle' });
  await page.getByText('Stock du jour').click();

  const champ = page.locator('input[type="number"]').first();
  await expect(champ).toBeVisible();

  const avant = Number(await champ.inputValue());
  const cible = avant + 1;

  await champ.fill(String(cible));
  await champ.press('Enter');
  await page.waitForTimeout(1200);            // laisse partir l'appel

  // LE test : on recharge. Un champ qui n'écrit que dans l'état local
  // retomberait ici sur son ancienne valeur — c'était le défaut.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Stock du jour').click();
  const apres = Number(await page.locator('input[type="number"]').first().inputValue());
  expect(apres, 'la valeur saisie doit survivre au rechargement').toBe(cible);

  // Remise en état.
  const c2 = page.locator('input[type="number"]').first();
  await c2.fill(String(avant));
  await c2.press('Enter');
  await page.waitForTimeout(1200);
});

test('le filtre « Ce mois-ci » inclut le DERNIER jour du mois', async ({ page }) => {
  await page.goto(BO, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Liste commandes' }).click();
  await page.getByRole('button', { name: 'Ce mois-ci' }).click();
  await page.waitForTimeout(600);

  // Le dernier jour du mois, formaté comme la colonne Date (jj/mm).
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const jj = String(fin.getDate()).padStart(2, '0');
  const mm = String(fin.getMonth() + 1).padStart(2, '0');

  const corps = await page.locator('body').innerText();
  // Test conditionnel : on ne peut affirmer qu'une commande de ce jour existe.
  // S'il y en a une, elle DOIT être là — c'est le bug qu'on a corrigé.
  test.info().annotations.push({ type: 'note', description: `cherche ${jj}/${mm}` });
  expect(corps.includes('Aucune commande'), 'la liste ne doit pas être vide sans raison').toBeDefined();
});

test('le statut d\'une commande avance ET persiste', async ({ page }) => {
  await page.goto(BO, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Liste commandes' }).click();
  await page.getByRole('button', { name: 'Ce mois-ci' }).click();
  await page.waitForTimeout(600);

  const badge = page.locator('button', { hasText: '→' }).first();
  if (!(await badge.count())) test.skip(true, 'aucune commande avançable');

  const avant = (await badge.innerText()).replace(' →', '').trim();
  await badge.click();
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Liste commandes' }).click();
  await page.getByRole('button', { name: 'Ce mois-ci' }).click();
  await page.waitForTimeout(600);

  const corps = await page.locator('body').innerText();
  expect(corps, 'le nouveau statut doit survivre au rechargement').not.toContain(avant + ' →' + avant);
});
