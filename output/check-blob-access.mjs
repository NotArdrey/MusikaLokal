import dotenv from '../web/node_modules/dotenv/lib/main.js';
import { list } from '../web/node_modules/@vercel/blob/dist/index.js';
dotenv.config({path:'.env.local',quiet:true});
try {
  const result = await list({limit:1});
  console.log(JSON.stringify({blobAccess:true,existingObjects:result.blobs.length}));
} catch(error) { console.error(error.message); process.exitCode=1; }
