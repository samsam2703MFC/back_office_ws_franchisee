/* =============================================================================
   inscription.spec.mjs — la page « Créer mon compte » du lien d'invitation.
   =============================================================================
   Ce qui est vérifié tient en une phrase : rien ne s'affiche qui ne vienne du
   serveur, et rien ne se crée sans que le serveur l'ait accepté.

   Le danger propre à cette page est qu'elle est belle même vide : la maquette
   d'origine portait un bureau, une adresse et une boutique écrits en dur. Un
   collaborateur les aurait lus comme un rattachement acquis, et se serait créé
   un compte relié à rien. D'où le contrôle « aucune valeur de la maquette ne
   subsiste » : il échoue si une seule de ces chaînes revient à l'écran.

   USAGE
     node tests/inscription.spec.mjs
   Un serveur bouchon sert le dépôt et l'API sur le port 8095 ; Chromium est
   pris là où l'environnement l'a installé (CHROMIUM= pour le forcer).
============================================================================= */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT=path.resolve(new URL('..', import.meta.url).pathname);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.otf':'font/otf','.ttf':'font/ttf'};
let MODE='ok'; let POSTS=[];
const INVITE={ok:true,etat:'valide',boutique:"L'Atelier By Uccle",raison:'Sopra Steria Benelux',
  site:'Avenue des Nerviens 9-31, 1040 Etterbeek',departements:['Delivery','Finance','RH'],
  domaine:'soprasteria.be',cp:'1040',logo:'',expire_le:'30/09/2026'};
const srv=http.createServer((req,res)=>{ const u=new URL(req.url,'http://x');
  const json=(code,b)=>{res.writeHead(code,{'content-type':'application/json'});res.end(b);};
  if(u.pathname==='/webshop/api/webshop/invite'){
    if(MODE==='ok'||MODE==='pris') return json(200,JSON.stringify(INVITE));
    if(MODE==='expire')  return json(410,JSON.stringify({ok:false,etat:'expire',boutique:INVITE.boutique,raison:INVITE.raison}));
    if(MODE==='revoque') return json(410,JSON.stringify({ok:false,etat:'revoque',boutique:INVITE.boutique,raison:INVITE.raison}));
    if(MODE==='inconnu') return json(404,JSON.stringify({ok:false,error:'unknown_invite'}));
    if(MODE==='panne')   { res.destroy(); return; }
    return json(500,'{}'); }
  if(u.pathname==='/webshop/api/webshop/invite-signup'&&req.method==='POST'){
    let b=''; req.on('data',c=>{b+=c;});
    return req.on('end',()=>{ const p=JSON.parse(b||'{}'); POSTS.push(p);
      if(MODE==='pris') return json(409,JSON.stringify({ok:false,error:'email_exists'}));
      json(200,JSON.stringify({ok:true,statut:'pending'})); }); }
  if(u.pathname.startsWith('/webshop/api/')) return json(200,'[]');
  let rel=u.pathname.replace(/^\/webshop\/backoffice_franchisee\/?/,'')||'index.html';
  const f=path.join(ROOT,decodeURIComponent(rel));
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('x');}
  res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});
  res.end(fs.readFileSync(f)); });
await new Promise(r=>srv.listen(8095,r));
const U='http://localhost:8095/webshop/backoffice_franchisee/inscription.html';
const br=await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{});
const DEMO=/Delhaize|marie\.dupont|Anderlecht|Osseghem|12\/09\/2026|exemple/i;

async function page(url){
  const ctx=await br.newContext({viewport:{width:1000,height:1200},deviceScaleFactor:2});
  const p=await ctx.newPage(); const errs=[];   // avertissements React du build de développement filtrés :
                   // « Invalid DOM property » (le gabarit HTML perd la casse) et
                   // « validateDOMNesting » (le runtime enveloppe les textes liés),
                   // tous deux présents à l'identique dans la console.
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/Failed to load resource|favicon|Invalid DOM property|validateDOMNesting/.test(t)) errs.push(t.split('\n')[0]);});
  await p.route('**unpkg.com/**',r=>r.fulfill({status:200,body:'',contentType:'text/javascript'}));
  await p.goto(url,{waitUntil:'networkidle'}); await p.waitForTimeout(900);
  return {p,ctx,errs};
}
const txt=(p)=>p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
/* Vraies interactions : React 17+ écoute focusout, pas blur — un événement
   synthétique « blur » ne déclenche jamais onBlur, et le test croirait à tort
   que l'écran ne dit rien. */
const remplir=async(p,id,v)=>{
  const el=p.locator('#'+id);
  const t=await el.evaluate(e=>e.tagName+':'+(e.type||''));
  if(t.startsWith('SELECT')) await el.selectOption(v);
  else if(t.endsWith(':checkbox')) { if(v) await el.check(); else await el.uncheck(); }
  else { await el.fill(String(v)); await el.blur(); }
  await p.waitForTimeout(120);
};
const verdict=[];
const dit=(n,ok,det)=>{ verdict.push([n,ok]); console.log((ok?'  OUI  ':'  NON  ')+n+(det?(' — '+det):'')); };

console.log('\n── 1. adresse sans invitation ──');
{ const {p,ctx,errs}=await page(U); const t=await txt(p);
  dit('aucun formulaire, et la raison est dite', /ne contient aucune invitation/.test(t)&&!(await p.$('#email')), t.slice(0,90));
  dit('aucune erreur JS', errs.length===0, errs[0]||''); await ctx.close(); }

console.log('\n── 2. invitation valide ──');
MODE='ok'; POSTS=[];
{ const {p,ctx,errs}=await page(U+'?i=JETON.DEMO.SIG'); const t=await txt(p);
  dit('le bureau servi par l\'API est affiché', /Sopra Steria Benelux/.test(t)&&/Avenue des Nerviens/.test(t));
  dit('la boutique livreuse vient de l\'API', /Livré par L'Atelier By Uccle/.test(t));
  dit('aucune valeur de la maquette ne subsiste', !DEMO.test(t), (t.match(DEMO)||[''])[0]);
  dit('le domaine imposé vient du jeton', /@soprasteria\.be/.test(t));
  dit('le code postal du jeton est pré-rempli', (await p.$eval('#cp',e=>e.value))==='1040');
  dit('les départements servis sont proposés',
    (await p.$$eval('#dept option',o=>o.map(x=>x.textContent.trim()).join('|')))==='Delivery|Finance|RH');
  // Domaine refusé
  await remplir(p,'email','jean@gmail.com'); await p.waitForTimeout(300);
  dit('une adresse hors domaine est refusée', /doit se terminer par @soprasteria\.be/.test(await txt(p)));
  // Formulaire complet
  await remplir(p,'prenom','Jean'); await remplir(p,'nom','Martin');
  await remplir(p,'email','jean.martin@soprasteria.be'); await remplir(p,'tel','+32 470 11 22 33');
  await remplir(p,'dept','Finance'); await remplir(p,'mdp','MotDePasse2026');
  await remplir(p,'mdp2','MotDePasse2026'); await remplir(p,'cgv',true);
  await p.waitForTimeout(400);
  dit('le bouton s\'active quand tout est valide', !(await p.$eval('button[type=submit]',b=>b.disabled)));
  await p.click('button[type=submit]'); await p.waitForTimeout(700);
  const post=POSTS[0]||{};
  dit('le jeton repart tel quel au serveur', post.i==='JETON.DEMO.SIG', JSON.stringify(post.i));
  dit('aucun identifiant de bureau/boutique n\'est posté par le navigateur',
    !('office' in post)&&!('shop' in post)&&!('client' in post), Object.keys(post).join(','));
  dit('le département choisi part bien', post.dept==='Finance', JSON.stringify(post.dept));
  const t2=await txt(p);
  dit('écran de succès après acceptation serveur', /en attente de validation/.test(t2)&&/jean\.martin@soprasteria\.be/.test(t2));
  dit('aucune erreur JS', errs.length===0, errs[0]||'');
  await ctx.close(); }

console.log('\n── 3. e-mail déjà inscrit (409) ──');
MODE='pris'; POSTS=[];
{ const {p,ctx}=await page(U+'?i=JETON.DEMO.SIG');
  await remplir(p,'prenom','Jean'); await remplir(p,'nom','Martin');
  await remplir(p,'email','jean.martin@soprasteria.be'); await remplir(p,'tel','+32 470 11 22 33');
  await remplir(p,'mdp','MotDePasse2026'); await remplir(p,'mdp2','MotDePasse2026'); await remplir(p,'cgv',true);
  await p.waitForTimeout(300); await p.click('button[type=submit]'); await p.waitForTimeout(700);
  const t=await txt(p);
  dit('le refus s\'affiche sous le champ', /Un compte existe déjà pour cette adresse/.test(t));
  dit('aucun écran de succès', !/en attente de validation/.test(t));
  await ctx.close(); }

console.log('\n── 4. lien expiré / révoqué ──');
for (const [m,att] of [['expire',/a expiré/],['revoque',/a été révoqué/]]) { MODE=m;
  const {p,ctx}=await page(U+'?i=JETON.DEMO.SIG'); const t=await txt(p);
  dit('« '+m+' » : message propre et pas de formulaire', att.test(t)&&!(await p.$('#email')), t.slice(0,80));
  await ctx.close(); }

console.log('\n── 5. lien inconnu du serveur ──');
MODE='inconnu';
{ const {p,ctx}=await page(U+'?i=JETON.FAUX.SIG'); const t=await txt(p);
  dit('dit inconnu, sans formulaire', /inconnu du serveur/.test(t)&&!(await p.$('#email')), t.slice(0,80));
  dit('le jeton n\'est pas recopié à l\'écran', !/JETON\.FAUX/.test(t));
  await ctx.close(); }

console.log('\n── 6. serveur injoignable ──');
MODE='panne';
{ const {p,ctx}=await page(U+'?i=JETON.DEMO.SIG'); const t=await txt(p);
  dit('panne annoncée, aucun formulaire, aucune valeur inventée',
    /injoignable|n’a pas répondu/.test(t)&&!(await p.$('#email'))&&!DEMO.test(t), t.slice(0,90));
  await ctx.close(); }

console.log('\n═════ verdict ═════');
const ko=verdict.filter(v=>!v[1]);
verdict.forEach((v,i)=>console.log((i+1)+'. '+v[0]+' : '+(v[1]?'OUI':'NON')));
console.log(ko.length?('\n'+ko.length+' point(s) en échec'):'\ntout est vert');
await br.close(); srv.close();
process.exit(ko.length?1:0);
