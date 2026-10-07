import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const catalog=JSON.parse(await readFile(new URL('../docs/billing/revenuecat-catalog.json',import.meta.url),'utf8'));
const sizes=[5,10,20,40,50,75,100,150,200];const out='/tmp/maislouvor-landing-billing-qa';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});let checks=0;
try {
 for(const path of ['/','/conheca/']){
  const page=await browser.newPage({viewport:{width:390,height:844},locale:'pt-BR',reducedMotion:'reduce'});page.setDefaultTimeout(20000);await page.goto('https://maislouvor.com'+path);
  await page.locator('#team-size').waitFor();await page.waitForFunction(()=>!document.querySelector('#team-size').disabled);
  for(const period of ['monthly','annual']){
   await page.locator(`input[name=billing][value=${period}]`).check({force:true});
   for(const [index,size] of sizes.entries()){
    await page.locator('#team-size').fill(String(index));
    for(const plan of ['essencial','estudio','asafe','completo']){
     const price=plan==='essencial'&&size===5?0:catalog.products.find(p=>p.plan===plan&&p.member_limit===size&&p.billing_period==='monthly').price_cents;
     const expected=price===0?'Grátis':((period==='annual'?Math.round(price*10/12):price)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
     const actual=await page.locator(`[data-plan=${plan}] [data-price]`).innerText();assert.equal(actual,expected,`${path} ${plan} ${size} ${period}`);checks++;
    }
   }
  }
  await page.locator('#planos').scrollIntoViewIfNeeded();await page.screenshot({path:out+(path==='/'?'/root.png':'/conheca.png')});
  assert.equal(await page.getByText('As assinaturas ainda não estão disponíveis para contratação.',{exact:false}).count(),0);checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
  await page.close();
 }
 console.log(JSON.stringify({passed:true,checks}));await writeFile(out+'/result.json',JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
