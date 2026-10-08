// Actual production API and public RevenueCat catalogue, disposable fixture only.
// Never fills payment details or submits a charge. Use qa-web-billing.py cleanup.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = JSON.parse(await readFile(process.env.BILLING_QA_FIXTURE, 'utf8'));
const origin = process.env.BILLING_QA_ORIGIN || 'http://127.0.0.1:4201';
const output = process.env.BILLING_QA_OUTPUT || '/tmp/maislouvor-billing-release-qa';
const engine = process.env.BILLING_QA_BROWSER || 'chromium';
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
await mkdir(output, { recursive: true });
let checks = 0; const results = [];
const check = (ok, message) => { assert.ok(ok, message); checks++; };
async function open(width, height, colorScheme='light', member=false) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', colorScheme, serviceWorkers: 'block' });
  await context.addInitScript(({fixture,member}) => {
    localStorage.setItem('sb-api-auth-token', JSON.stringify(member ? fixture.member_session : fixture.session));
    localStorage.setItem('louvor_current_team', fixture.team_id);
    localStorage.setItem('louvor-theme', 'system');
  }, {fixture,member});
  const page = await context.newPage(); page.setDefaultTimeout(25000); const errors = []; const providerWarnings = [];
  page.on('pageerror', e => {
    // WebKit reports Stripe attempts to inspect its cross-origin parent. The
    // browser correctly blocks them; still verify the rendered form and Back.
    if (e.message.includes('js.stripe.com') && e.message.includes('accessing a frame with origin')) providerWarnings.push('Stripe cross-origin access blocked');
    else errors.push(e.message);
  });
  await page.goto(origin + '/app/settings');
  await page.getByRole('tab', {name:'Assinatura',exact:true}).waitFor();
  return {context,page,errors,providerWarnings};
}
async function fits(page) {
  const metrics = await page.evaluate(() => {
    const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom}; };
    return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,dock:rect('.billing-checkout'),content:rect('.billing-builder')};
  });
  check(metrics.scroll <= metrics.width, 'Page horizontal overflow');
  check(metrics.dock.y>=0 && metrics.dock.bottom<=metrics.height, 'CTA outside viewport');
  check(Math.abs(metrics.dock.x-metrics.content.x)<2 && Math.abs(metrics.dock.width-metrics.content.width)<2,'CTA aligned with content');
  return metrics;
}
try {
  for (const [width,height] of (process.env.BILLING_QA_CHECKOUT_ONLY ? [] : [[320,740],[390,844],[440,956],[844,390],[1440,1000]])) {
    const {context,page,errors}=await open(width,height);
    await page.getByRole('tab',{name:'Assinatura',exact:true}).click();
    const input=page.getByRole('spinbutton',{name:'Integrantes'});await input.fill('6');await input.press('Enter');
    await page.getByRole('button',{name:/Continuar com este plano/}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.billing-continue')?.disabled);
    await page.getByRole('radio',{name:'Essencial',exact:true}).locator('..').click();
    check((await page.getByLabel('Resumo do plano').innerText()).includes('16,90'),'Live monthly price in BRL');
    const top=await fits(page);
    await page.screenshot({path:`${output}/${engine}-${width}-top.png`});
    await page.locator('main').evaluate(el=>{el.scrollTop=el.scrollHeight});
    const bottom=await fits(page);check(Math.abs(top.dock.y-bottom.dock.y)<2,'Floating CTA stays fixed on app scroll');
    const renewal=await page.locator('.billing-renewal').boundingBox();check(renewal.y+renewal.height<bottom.dock.y,'Final terms can scroll above CTA');
    await page.screenshot({path:`${output}/${engine}-${width}-bottom.png`});
    await page.getByRole('radio',{name:/Anual/}).locator('..').click();
    check((await page.getByLabel('Resumo do plano').innerText()).includes('169,00'),'Live annual total');
    check((await page.getByLabel('Resumo do plano').innerText()).includes('em uma cobrança'),'Annual billing explicit');
    await page.getByRole('button',{name:'Voltar',exact:true}).click();
    check(await page.locator('.billing-checkout').count()===0,'Back removes floating purchase CTA');
    check(await page.getByRole('tab',{name:'Perfil',exact:true}).getAttribute('data-state')==='active','Back returns to previous app tab');
    check(errors.length===0,'Page errors: '+errors.join(';'));
    results.push({width,height,passed:true});console.log(JSON.stringify({width,height,passed:true}));await context.close();
  }
  const {context,page,errors,providerWarnings}=await open(390,844);
  await page.getByRole('tab',{name:'Membros',exact:true}).click();
  await page.getByRole('button',{name:/Adicionar manualmente/i}).click();
  await page.getByRole('heading',{name:'Sua equipe cresceu'}).waitFor();
  check(await page.locator('#invite-email').isHidden(),'Full team does not show member form');
  await page.getByRole('button',{name:'Escolher plano e continuar'}).click();
  check(await page.getByRole('spinbutton',{name:'Integrantes'}).inputValue()==='6','Sixth member goes to matching capacity');
  await page.waitForFunction(()=>!document.querySelector('.billing-continue')?.disabled);
  await page.getByRole('radio',{name:'Essencial',exact:true}).locator('..').click();
  await page.getByRole('button',{name:/Continuar com este plano:/}).click();
  // Checkout is the genuine RevenueCat SDK UI, not a mock. Do not submit it.
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>f.src.includes('stripe.com')),null,{timeout:45000});
  await page.frameLocator('iframe[src*="embedded-checkout-inner"]').getByRole('button',{name:'Assinar',exact:true}).waitFor({timeout:45000});
  await page.screenshot({path:`${output}/${engine}-checkout.png`});
  check((await page.locator('body').innerText()).match(/16,90|16.90/),'Selected real checkout price');
  check(errors.length===0,'Checkout page errors: '+errors.join('; ').replace(/https?:\/\/\S+/g,'[provider URL]'));
  await page.getByRole('button',{name:'‹ Voltar aos planos',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.rcb-ui-container.fullscreen') && !document.querySelector('.billing-continue')?.disabled);
  check(await page.getByRole('spinbutton',{name:'Integrantes'}).inputValue()==='6','Cancelled checkout retains selection and releases purchase state');
  results.push({checkoutOpened:true,cancelledViaBack:true,charged:false,providerWarnings});await context.close();
  const member=await open(390,844,'light',true);
  await member.page.getByRole('tab',{name:'Assinatura',exact:true}).click();
  await member.page.getByText('Assinatura da equipe',{exact:true}).waitFor();
  check(await member.page.locator('.billing-continue').count()===0,'Member has no payment action');
  await member.context.close();
  await writeFile(`${output}/${engine}${process.env.BILLING_QA_CHECKOUT_ONLY ? '-checkout' : ''}-results.json`,JSON.stringify({checks,results},null,2));
  console.log(JSON.stringify({engine,checks,results}));
} finally { await browser.close(); }
