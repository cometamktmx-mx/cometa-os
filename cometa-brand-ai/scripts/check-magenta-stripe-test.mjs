// Reads only candidate keys in memory; never outputs values or Stripe response bodies.
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import Stripe from 'stripe';
const env=fs.existsSync('.env.local')?parseEnv(fs.readFileSync('.env.local','utf8')):{};
const names=['STOREFRONT_STRIPE_TEST_SECRET_KEY','COMU_STRIPE_SECRET_KEY','STRIPE_SECRET_KEY'];
const accounts=new Map();
for(const name of names){
 const value=env[name]||process.env[name];
 const mode=value?.startsWith('sk_test_')?'test':value?.startsWith('sk_live_')?'live':'unknown';
 let verification='NOT_CALLED',accountGroup=null;
 if(mode==='test'&&process.argv.includes('--verify')){
  try{const account=await new Stripe(value,{timeout:10000,maxNetworkRetries:0}).accounts.retrieveCurrent();
   if(!accounts.has(account.id))accounts.set(account.id,'test-account-'+(accounts.size+1));
   accountGroup=accounts.get(account.id);verification='READ_ONLY_ACCOUNT_OK';
  }catch(e){verification=e.statusCode===401?'REJECTED':e.statusCode===403?'FORBIDDEN':'UNAVAILABLE';}
 }
 console.log(JSON.stringify({variable:name,present:!!value,mode,verification,accountGroup}));
}
