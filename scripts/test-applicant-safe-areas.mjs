import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
import {chromium} from '@playwright/test';
import * as cvApplicantName from '../mobile/supabase/functions/_shared/cvApplicantName.ts';
const require=createRequire(new URL('../mobile/package.json',import.meta.url));
const React=require('react'),RN=require('react-native-web'),{renderToStaticMarkup}=require('react-dom/server');
const h=React.createElement;
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const metrics=React.createContext(null);
const SafeAreaProvider=({children,style})=>h(metrics.Provider,{value:{top:48,bottom:34,left:8,right:8}},h(RN.View,{style,testID:'modal-insets-provider'},children));
const SafeAreaView=({children,style,edges})=>{
  const insets=React.useContext(metrics);assert.ok(insets,'Modal measures insets in its own provider');
  const padding={};for(const edge of edges)padding['padding'+edge[0].toUpperCase()+edge.slice(1)]=insets[edge];
  return h(RN.View,{style:[style,padding],testID:'modal-safe-content'},children);
};
function load(file) {
 const exports={};
 vm.runInNewContext(compile(readFileSync(file,'utf8')),{exports,console,setTimeout,clearTimeout,
   require(name){
     if(name==='react')return React;
     if(name==='react/jsx-runtime')return require('react/jsx-runtime');
     if(name==='react-native')return {...RN,Modal:({visible,children})=>visible?h(RN.View,{style:{flex:1}},children):null};
     if(name==='react-native-safe-area-context')return {SafeAreaProvider,SafeAreaView};
     if(name==='expo-router')return {useRouter:()=>({push(){}})};
     if(name==='@expo/vector-icons')return {Ionicons:({size=16})=>h(RN.View,{style:{width:size,height:size,flexShrink:0}})};
     if(name.includes('gigApplicantFilters'))return {isActiveApplication:()=>true};
     if(name.includes('cvApplicantName'))return cvApplicantName;
     if(name.includes('theme/tokens'))return {typography:{body:'sans-serif',heading:'sans-serif',medium:'sans-serif',semibold:'sans-serif',bold:'sans-serif'}};
     if(name.includes('ProfileAvatar'))return {__esModule:true,default:({size})=>h(RN.View,{style:{width:size,height:size,flexShrink:0}})};
     if(name.includes('InAppMediaViewer'))return {__esModule:true,default:()=>null};
     throw Error(`Unexpected dependency ${name}`);
   },
 });return exports.default;
}

test('both real applicant modals keep the header and actions within controlled notch and gesture insets',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
 const noop=()=>{};
 const base={background:'#f8fafc',surface:'#fff',inputBackground:'#f1f5f9',border:'#cbd5e1',primary:'#6366f1',text:'#111827',textSecondary:'#475569'};
 const components=[['gig',load('mobile/src/components/ApplicantDetailsModal.tsx')],['group',load('mobile/src/components/ConnectionApplicantDetailsModal.tsx')]];
 const results=[];mkdirSync('docs/testing/remaining-bugs-2026-10-07',{recursive:true});
 try {
  for(const [name,Component] of components)for(const width of [320,430])for(const dark of [false,true])for(const scale of [1,1.6]) {
   const colors=dark?{...base,background:'#0f172a',surface:'#1e293b',text:'#f8fafc',textSecondary:'#94a3b8'}:base;
   const application={id:'fixture',status:'pending',applicant:{full_name:'Jared and Neil — MusikaLokal applicant with a long name'},sender_group:{name:'A very long group applicant name'},group:{name:'A very long group applicant name'},event_details:{request_details:{}}};
   const html=renderToStaticMarkup(h(Component,{visible:true,summary:application,details:application,application,colors,entityLabel:'group',loading:false,error:null,onClose:noop,onRetry:noop,onAccept:noop,onDecline:noop,onOpenMedia:noop}));
   await page.setViewportSize({width,height:900});
   await page.setContent(`<style>html,body{margin:0;height:100%}#root{height:900px;display:flex;flex-direction:column}${RN.StyleSheet.getSheet().textContent}</style><div id="root">${html}</div>`);
   if(scale!==1)await page.evaluate(scale=>{for(const node of document.querySelectorAll('[dir="auto"]')){const c=getComputedStyle(node);node.style.fontSize=(parseFloat(c.fontSize)*scale)+'px';if(Number.isFinite(parseFloat(c.lineHeight)))node.style.lineHeight=(parseFloat(c.lineHeight)*scale)+'px';}},scale);
   const bounds=await page.evaluate(()=>{
     const safe=document.querySelector('[data-testid="modal-safe-content"]');
     const children=[...safe.children];
     const header=children[0].getBoundingClientRect(),footer=children.at(-1).getBoundingClientRect();
     return {headerTop:header.top,footerBottom:footer.bottom,left:header.left,right:header.right};
   });
   assert.ok(bounds.headerTop>=48,`${name}: header overlaps status bar`);
   assert.ok(bounds.footerBottom<=866,`${name}: footer overlaps gesture bar ${JSON.stringify(bounds)}`);
   assert.ok(bounds.left>=8&&bounds.right<=width-8,`${name}: horizontal insets missing`);
   results.push({name,width,dark,scale,...bounds});
   if(width===320&&dark&&scale===1.6)await page.screenshot({path:`docs/testing/remaining-bugs-2026-10-07/${name}-safe-area.png`});
  }
 } finally {await browser.close();}
 console.log(`${results.length} controlled safe-area layouts pass; physical Android rendering remains pending.`);
});
