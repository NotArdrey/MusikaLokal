import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "fixtures/local-test/media");
await mkdir(out, { recursive: true });
const specs = [
  ["adrian-solo.webm", "Adrian Velasco — solo guitar and vocals fixture", 220],
  ["miguel-solo.webm", "Miguel Santos — solo drums fixture", 165],
  ["northline-duo.webm", "Northline Duo — whole-duo fixture", 196],
  ["midnight-avenue.webm", "Midnight Avenue — whole three-member band fixture", 147],
];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (const [filename, label, frequency] of specs) {
  const base64 = await page.evaluate(async ({ label, frequency }) => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext("2d"); const stream = canvas.captureStream(20);
    const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.frequency.value = frequency; gain.gain.value = 0.04; oscillator.connect(gain).connect(audio.createMediaStreamDestination());
    const destination = audio.createMediaStreamDestination(); oscillator.disconnect(); oscillator.connect(gain); gain.disconnect(); gain.connect(destination);
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track)); oscillator.start();
    const chunks = []; const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
    recorder.ondataavailable = event => chunks.push(event.data); recorder.start();
    const started = performance.now();
    await new Promise(resolve => { const draw = now => { const t=(now-started)/1000; ctx.fillStyle="#111827"; ctx.fillRect(0,0,640,360); ctx.fillStyle="#8b5cf6"; for(let i=0;i<32;i++){const h=35+Math.sin(t*5+i*.7)*28;ctx.fillRect(i*20,280-h,12,h);} ctx.fillStyle="#fff";ctx.font="bold 25px sans-serif";ctx.textAlign="center";ctx.fillText(label,320,145);ctx.font="18px sans-serif";ctx.fillText("LOCAL TEST MEDIA — synthetic performance fixture",320,190); if(t<3) requestAnimationFrame(draw); else resolve();}; requestAnimationFrame(draw); });
    recorder.stop(); oscillator.stop(); await new Promise(resolve => recorder.onstop=resolve); const bytes=new Uint8Array(await new Blob(chunks,{type:"video/webm"}).arrayBuffer()); let binary=""; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary);
  }, { label, frequency });
  await writeFile(path.join(out, filename), Buffer.from(base64, "base64"));
}
await browser.close();
console.log(`Created ${specs.length} valid WebM fixtures in ${out}`);
