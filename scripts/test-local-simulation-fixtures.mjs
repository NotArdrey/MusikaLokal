import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { gig, groups, people } from "./local-test-data/fixtures.mjs";
import { matchGigMemberRequirements } from "../web/supabase/functions/_shared/gigMemberRequirementMatching.ts";

const cv = async key => readFile(new URL(`../fixtures/local-test/cvs/${people.find(p=>p.key===key).cv}`, import.meta.url), "utf8");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const slot = key => gig.requirements.slots[key].specific_requirements;
const roster = group => group.members.map(m => ({ user_id:m.user, member_name:people.find(p=>p.key===m.user).name, role:m.role, instrument:m.instrument }));

test("Midnight Avenue has exactly three members and distinct complete coverage", () => {
  const band=groups.find(g=>g.key==="midnight"); assert.equal(band.members.length,3);
  const result=matchGigMemberRequirements(slot("band"),roster(band),"band"); assert.equal(result.matched_count,3); assert.deepEqual(result.members.map(x=>x.member_name),["Ethan Ramirez","Lucas Garcia","Nathan Flores"]);
});
test("Midnight Avenue without Nathan leaves bass unsatisfied",()=>{const band=groups.find(g=>g.key==="midnight");const result=matchGigMemberRequirements(slot("band"),roster(band).filter(m=>m.user_id!=="nathan"),"band");assert.equal(result.matched_count,2);assert.equal(result.members.find(x=>x.requirement_label==="Bass guitar").status,"unmatched");});
test("Northline uses two distinct members for vocalist and guitar",()=>{const duo=groups.find(g=>g.key==="northline");const result=matchGigMemberRequirements(slot("duo"),roster(duo),"duo");assert.equal(result.matched_count,2);assert.notEqual(result.members[0].member_id,result.members[1].member_id);});
test("intentional CV evidence omissions and conflicts remain intact",async()=>{const andrea=(await cv("andrea")).toLowerCase(),paolo=(await cv("paolo")).toLowerCase(),nathan=(await cv("nathan")).toLowerCase(),miguel=(await cv("miguel")).toLowerCase();assert.doesNotMatch(andrea,/quezon city|years? of experience|genre:/);assert.match(paolo,/primary instrument: keyboard/);assert.doesNotMatch(paolo,/backing vocals|indie/);assert.doesNotMatch(nathan,/bass guitar/);assert.match(miguel,/bass guitar/);assert.doesNotMatch(miguel,/drums|jazz|funk|makati/);});
test("all referenced local assets exist and are non-empty",async()=>{const media=[...people.map(p=>p.image),...people.filter(p=>p.video).map(p=>p.video),...groups.flatMap(g=>[g.image,g.video]),gig.image];for(const file of media)assert.ok((await readFile(path.join(root,"fixtures/local-test/media",file))).length>32,file);for(const p of people.filter(p=>p.cv))assert.ok((await readFile(path.join(root,"fixtures/local-test/cvs",p.cv))).length>32,p.cv);});
test("every account has private identity verification images",async()=>{for(const person of people){for(const file of [`${person.key}-id-front.png`,"test-id-back.png",person.image]){const folder=file.endsWith("id-front.png")||file==="test-id-back.png"?"identity":"media";assert.ok((await readFile(path.join(root,"fixtures/local-test",folder,file))).length>32,file);}}});
