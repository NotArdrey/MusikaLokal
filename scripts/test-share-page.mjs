import assert from 'node:assert/strict';
import {readFileSync, mkdirSync} from 'node:fs';
import {test} from 'node:test';
import {chromium} from '@playwright/test';
import {getShareDestination} from '../mobile/src/utils/shareLinks.ts';
import {getActionDestination, buildActionEmailUrl} from '../mobile/src/utils/actionLinks.ts';

test('published share gateway preserves all targets, offers the APK and renders in both themes', async () => {
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();
  let releaseAvailable=true;
  let pressed;
  await page.exposeFunction('captureOpen',value=>{pressed=value;});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://musika-lokal.vercel.app/**', async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/android-release.json')return route.fulfill({status:releaseAvailable?200:503,contentType:'application/json',body:JSON.stringify({downloadUrl:'https://fixture.public.blob.vercel-storage.com/testing.apk?download=1'})});
    const name=pathname.startsWith('/share/')?pathname.split('/').at(-1):'index.html';
    const contentType=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
    return route.fulfill({contentType,body:readFileSync(`web/public/share/${name}`,'utf8')});
  });
  try {
    for(const path of ['/feed?postId=one','/feed?listingId=band&listingType=group','/group_details?id=two',
      '/profile?userId=three','/production_team?teamId=four','/product_details?product_id=five','/playlist_details?playlist_id=six']) {
      await page.goto('https://musika-lokal.vercel.app'+path);
      await page.locator('#open-app').waitFor({state:'visible'});
      const href=await page.locator('#open-app').getAttribute('href');
      assert.equal(getShareDestination(href),getShareDestination(path));
      await page.waitForFunction(()=>document.getElementById('download').href.includes('testing.apk'));
      await page.locator('#open-app').evaluate(node=>node.addEventListener('click',e=>{e.preventDefault();window.captureOpen(node.href);}));
      await page.locator('#open-app').click();assert.equal(pressed,href);
    }
    const id='9d28c58a-7f1e-4fcb-8091-b8f1b65f79cc';
    for (const [route,params] of [
      ['/group_application_cv',{applicationId:id}], ['/bookings',{tab:'History'}],
      ['/production_team',{teamId:id,tab:'Applications'}], ['/wallet',{section:'outstanding',bookingId:id}],
      ['/gig_feature_consent',{applicationId:id}], ['/manage_gig',{id,tab:'Applicants'}],
      ['/post_details',{post_id:id}],
    ]) {
      const link=buildActionEmailUrl({route,route_params:params});
      const target=getActionDestination(link);
      const legacy=new URL(link);
      legacy.searchParams.set('destination',encodeURIComponent(target));
      for (const input of [link,legacy.href]) {
        await page.goto(input);
        await page.locator('#open-app').waitFor({state:'visible'});
        const href=await page.locator('#open-app').getAttribute('href');
        assert.equal(getActionDestination(href),target);
        assert.equal(new URL(href).searchParams.get('destination'),target,'gateway encodes the native destination once');
        await page.waitForFunction(()=>document.getElementById('download').href.includes('testing.apk'));
        await page.locator('#open-app').evaluate(node=>node.addEventListener('click',e=>{e.preventDefault();window.captureOpen(node.href);}));
        await page.locator('#open-app').click();assert.equal(pressed,href);
      }
    }
    mkdirSync('docs/testing/remaining-bugs-2026-10-07',{recursive:true});
    for(const colorScheme of ['light','dark'])for(const width of [320,1280])for(const scale of [1,1.6]) {
      await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:900});
      await page.goto('https://musika-lokal.vercel.app/feed?postId=one');
      await page.locator('#open-app').waitFor({state:'visible'});
      await page.evaluate(scale=>{document.documentElement.style.fontSize=`${16*scale}px`;},scale);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      if(width===320&&scale===1.6)await page.screenshot({path:`docs/testing/remaining-bugs-2026-10-07/share-${colorScheme}.png`,fullPage:true});
    }
    await page.goto('https://musika-lokal.vercel.app/feed?listingId=x&listingType=admin');
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('incomplete'));
    assert.equal(await page.locator('#open-app').isVisible(),false);
    await page.goto('https://musika-lokal.vercel.app/action?destination=%2Fgroup_application_cv%3FapplicationId%3Dinvalid');
    await page.waitForFunction(()=>document.getElementById('message').textContent.includes('incomplete'));
    assert.equal(await page.locator('#open-app').isVisible(),false);
    releaseAvailable=false;await page.goto('https://musika-lokal.vercel.app/feed?postId=one');
    await page.waitForFunction(()=>document.getElementById('download-status').textContent.includes('home page'));
    assert.equal(await page.locator('#download').getAttribute('href'),'/');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
