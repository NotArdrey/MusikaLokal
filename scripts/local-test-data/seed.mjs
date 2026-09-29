import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applicationIds, gig, groups, people, TEST_PASSWORD } from "./fixtures.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mediaDir = path.join(repo, "fixtures/local-test/media");
const cvDir = path.join(repo, "fixtures/local-test/cvs");
const envFile = process.argv.find(x => x.startsWith("--env="))?.slice(6) || ".env.local-test";
const envText = await readFile(path.resolve(repo, envFile), "utf8").catch(() => "");
const fileEnv = Object.fromEntries(envText.split(/\r?\n/).filter(x => x && !x.startsWith("#") && x.includes("=")).map(x => { const i=x.indexOf("="); return [x.slice(0,i), x.slice(i+1).replace(/^['\"]|['\"]$/g, "")]; }));
const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error(`Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
const host = new URL(url).hostname;
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "host.docker.internal";
if (!isLocal && !(process.argv.includes("--allow-remote-test-project") && process.env.MUSIKALOKAL_TEST_DATA_CONFIRM === "I_UNDERSTAND_THIS_IS_A_TEST_PROJECT")) {
  throw new Error(`Refusing non-local Supabase host ${host}. This seed must never target production.`);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const requiredColumns = {
  profiles: "id,email,full_name,role,location,avatar_url,bio,contact_number",
  groups: "id,name,owner_id,group_type,location,latitude,longitude,genre",
  group_members: "id,group_id,user_id,role", group_roster_members: "id,group_id,user_id,member_name,member_role,instrument,metadata,raw_member",
  gigs: "id,organizer_id,name,location,latitude,longitude,status,permit_status,event_date",
  gig_applications: "id,applicant_id,gig_id,group_id,slot_type,cv_url,video_url,ai_portfolio_review_consent,member_cv_status,leader_approval_status",
  gig_application_members: "id,application_id,group_id,user_id,member_name_snapshot,cv_storage_bucket,cv_storage_path,cv_status,ai_review_consent",
  manual_identity_reviews: "id,user_id,submitted_by_email,document_type,document_type_key,document_country,source,status,front_image_path,back_image_path,selfie_image_path,submitted_role",
};
for (const [table, columns] of Object.entries(requiredColumns)) { const { error } = await db.from(table).select(columns).limit(0); if (error) throw new Error(`Schema preflight failed for ${table}: ${error.message}`); }

async function getOrCreateUser(person) {
  let page=1, found;
  while (!found) { const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 }); if (error) throw error; found=data.users.find(u=>u.email?.toLowerCase()===person.email); if (found || data.users.length<1000) break; page++; }
  if (!found) { const { data, error }=await db.auth.admin.createUser({ email:person.email, password:TEST_PASSWORD, email_confirm:true, user_metadata:{ full_name:person.name, test_fixture:true } }); if(error) throw error; found=data.user; }
  else { const { error }=await db.auth.admin.updateUserById(found.id,{ password:TEST_PASSWORD, email_confirm:true, user_metadata:{...(found.user_metadata||{}),full_name:person.name,test_fixture:true} }); if(error) throw error; }
  return found;
}
async function upload(bucket, objectPath, file, contentType, isPublic=true) {
  const body=await readFile(file); const { error }=await db.storage.from(bucket).upload(objectPath,body,{contentType,upsert:true}); if(error) throw new Error(`${bucket}/${objectPath}: ${error.message}`);
  return isPublic ? db.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl : objectPath;
}
const ids={};
for (const person of people) {
  const user=await getOrCreateUser(person); ids[person.key]=user.id;
  const avatar=await upload("avatars",`${user.id}/local-test/${person.image}`,path.join(mediaDir,person.image),"image/png");
  const { error }=await db.from("profiles").upsert({ id:user.id,email:person.email,full_name:person.name,role:person.role,location:person.location,avatar_url:avatar,bio:person.bio||"MusikaLokal local/test fixture",contact_number:"+63 917 555 0199",is_verified:false,verification_status:"PENDING_REVIEW",id_document_expiry:"2031-12-31",id_verified_at:null }); if(error) throw error;
  await db.from("profile_skills").delete().eq("profile_id",user.id); await db.from("profile_genres").delete().eq("profile_id",user.id);
  if(person.skills.length){const {error:e}=await db.from("profile_skills").insert(person.skills.map(skill=>({profile_id:user.id,skill})));if(e)throw e;}
  if(person.genres.length){const {error:e}=await db.from("profile_genres").insert(person.genres.map(genre=>({profile_id:user.id,genre})));if(e)throw e;}
  const frontPath=await upload("identity-manual",`${user.id}/local-test/front.png`,path.join(repo,"fixtures/local-test/identity",`${person.key}-id-front.png`),"image/png",false);
  const backPath=await upload("identity-manual",`${user.id}/local-test/back.png`,path.join(repo,"fixtures/local-test/identity/test-id-back.png"),"image/png",false);
  const selfiePath=await upload("identity-manual",`${user.id}/local-test/selfie.png`,path.join(mediaDir,person.image),"image/png",false);
  await db.from("manual_identity_reviews").delete().eq("user_id",user.id).eq("source","MANUAL_UPLOAD");
  const {error:idError}=await db.from("manual_identity_reviews").insert({user_id:user.id,submitted_by_email:person.email,document_type:"TEST FIXTURE — NOT VALID IDENTIFICATION",document_type_key:"test_fixture",document_country:"PHL",source:"MANUAL_UPLOAD",status:"PENDING_REVIEW",front_image_path:frontPath,back_image_path:backPath,selfie_image_path:selfiePath,submitted_role:person.role,review_notes:"Development/test data only. Never approve as real identity evidence.",metadata:{test_fixture:true,id_document_expiry:"2031-12-31"}});if(idError)throw idError;
}
const mediaUrls={};
for(const group of groups){
  const imageUrl=await upload("listings",`${ids[group.owner]}/groups/${group.id}/${group.image}`,path.join(mediaDir,group.image),"image/png");
  const videoUrl=await upload("documents",`${ids[group.owner]}/local-test/${group.video}`,path.join(mediaDir,group.video),"video/webm"); mediaUrls[group.key]={imageUrl,videoUrl};
  const {error}=await db.from("groups").upsert({id:group.id,name:group.name,owner_id:ids[group.owner],group_type:group.type,description:"Development/test fixture only",genre:group.genre,location:gig.location,latitude:gig.latitude,longitude:gig.longitude,open_group_applications:false});if(error)throw error;
  await db.from("group_members").delete().eq("group_id",group.id); await db.from("group_roster_members").delete().eq("group_id",group.id); await db.from("group_media").delete().eq("group_id",group.id);
  const {error:me}=await db.from("group_members").insert(group.members.map(m=>({group_id:group.id,user_id:ids[m.user],role:m.membership})));if(me)throw me;
  const {error:re}=await db.from("group_roster_members").insert(group.members.map((m,i)=>({group_id:group.id,user_id:ids[m.user],member_name:people.find(p=>p.key===m.user).name,member_role:m.role,instrument:m.instrument,sort_order:i,avatar_url:people.find(p=>p.key===m.user) && db.storage.from("avatars").getPublicUrl(`${ids[m.user]}/local-test/${people.find(p=>p.key===m.user).image}`).data.publicUrl,metadata:{test_fixture:true},raw_member:{roles:[m.role],instruments:[m.instrument]}})));if(re)throw re;
  const {error:ie}=await db.from("group_media").insert({group_id:group.id,media_type:"image",media_url:imageUrl,sort_order:0});if(ie)throw ie;
}
const gigImage=await upload("listings",`${ids.andrea}/gigs/${gig.id}/${gig.image}`,path.join(mediaDir,gig.image),"image/png");
const eventDate=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
{const {error}=await db.from("gigs").upsert({id:gig.id,organizer_id:ids.andrea,name:gig.name,description:"Local/test-only alternative live night.",location:gig.location,latitude:gig.latitude,longitude:gig.longitude,budget:15000,rate:15000,status:"open",permit_status:"approved",event_date:eventDate,reapplication_cooldown_days:0});if(error)throw error;}
await db.from("gig_media").delete().eq("gig_id",gig.id); await db.from("gig_requirements").delete().eq("gig_id",gig.id);
{const {error}=await db.from("gig_media").insert({gig_id:gig.id,media_type:"image",media_url:gigImage,sort_order:0});if(error)throw error;}
{const {error}=await db.from("gig_requirements").insert(Object.entries(gig.requirements).map(([requirement_key,requirement_value])=>({gig_id:gig.id,requirement_key,requirement_value})));if(error)throw error;}

async function cvUrl(personKey, privateCv=false, appId="solo") { const p=people.find(x=>x.key===personKey); const objectPath=privateCv?`${ids[personKey]}/gig-applications/${appId}/${p.cv}`:`${ids[personKey]}/cvs/${p.cv}`; return upload(privateCv?"application-cvs":"documents",objectPath,path.join(cvDir,p.cv),"text/plain",!privateCv); }
async function personVideo(key){const p=people.find(x=>x.key===key);return upload("documents",`${ids[key]}/local-test/${p.video}`,path.join(mediaDir,p.video),"video/webm");}
await db.from("gig_applications").delete().eq("gig_id",gig.id);
for(const key of ["adrian","miguel"]){const cv=await cvUrl(key),video=await personVideo(key);const {error}=await db.from("gig_applications").insert({id:applicationIds[key],applicant_id:ids[key],submitted_by_user_id:ids[key],gig_id:gig.id,is_solo_application:true,slot_type:"solo",status:"pending",cv_url:cv,video_url:video,ai_portfolio_review_consent:key==="adrian",member_cv_status:"not_required",performer_snapshot:{display_name:people.find(p=>p.key===key).name,test_fixture:true}});if(error)throw error;}
for(const group of groups){
  const appId=applicationIds[group.key], submitter=group.key==="midnight"?"lucas":group.owner;
  const cvs={}; for(const m of group.members)cvs[m.user]=await cvUrl(m.user,true,appId);
  const {error}=await db.from("gig_applications").insert({id:appId,applicant_id:ids[submitter],submitted_by_user_id:ids[submitter],gig_id:gig.id,group_id:group.id,is_solo_application:false,slot_type:group.type==="duo"?"duo":"band",status:"pending",cv_url:null,video_url:mediaUrls[group.key].videoUrl,ai_portfolio_review_consent:true,leader_approval_status:"approved",leader_reviewed_at:new Date().toISOString(),member_cv_status:"complete",member_cv_required_count:group.members.length,member_cv_submitted_count:group.members.length,member_cv_completed_at:new Date().toISOString(),performer_snapshot:{display_name:group.name,test_fixture:true,initiated_by_non_owner:submitter!==group.owner}});if(error)throw error;
  const {data:members}=await db.from("group_members").select("id,user_id").eq("group_id",group.id); const {data:roster}=await db.from("group_roster_members").select("id,user_id,member_name,member_role,instrument").eq("group_id",group.id);
  const {error:memberError}=await db.from("gig_application_members").insert(group.members.map(m=>{const r=roster.find(x=>x.user_id===ids[m.user]);return{application_id:appId,group_id:group.id,group_member_id:members.find(x=>x.user_id===ids[m.user])?.id,roster_member_id:r.id,user_id:ids[m.user],member_name_snapshot:r.member_name,role_snapshot:r.member_role,instrument_snapshot:r.instrument,cv_storage_bucket:"application-cvs",cv_storage_path:cvs[m.user],cv_filename:people.find(p=>p.key===m.user).cv,cv_status:"submitted",ai_review_consent:true,cv_submitted_at:new Date().toISOString()};}));if(memberError)throw memberError;
}
console.log(JSON.stringify({seeded:true,host,profile_ids:ids,group_ids:Object.fromEntries(groups.map(g=>[g.key,g.id])),gig_id:gig.id,application_ids:applicationIds,identity_reviews:people.length,midnight_member_count:groups.find(g=>g.key==="midnight").members.length,applications:4},null,2));
