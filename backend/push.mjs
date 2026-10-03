import {createECDH,createPrivateKey,generateKeyPairSync,randomBytes,hkdfSync,createCipheriv,sign} from 'node:crypto';
export function newVapid(){const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'});return {publicKey:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url'),privateKey:pair.privateKey.export({format:'jwk'})}}
export function subscription(s){
 if(!s||typeof s.endpoint!=='string'||s.endpoint.length>1800)throw Error('Invalid subscription');const u=new URL(s.endpoint);
 const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','updates-autopush.stage.mozaws.net','web.push.apple.com','wns2-db5p.notify.windows.com'];
 if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||!allowed.includes(u.hostname)&&!u.hostname.endsWith('.push.apple.com')&&!u.hostname.endsWith('.notify.windows.com'))throw Error('Unsupported push endpoint');
 if(!/^[A-Za-z0-9_-]+$/.test(s.keys?.p256dh||'')||! /^[A-Za-z0-9_-]+$/.test(s.keys?.auth||'')||Buffer.from(s.keys.p256dh,'base64url').length!==65||Buffer.from(s.keys.auth,'base64url').length!==16)throw Error('Invalid subscription keys');
 const e=createECDH('prime256v1');e.generateKeys();e.computeSecret(Buffer.from(s.keys.p256dh,'base64url'));return {endpoint:u.href,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth},expirationTime:s.expirationTime||null};
}
export function encrypt(s,json){
 const client=Buffer.from(s.keys.p256dh,'base64url'),auth=Buffer.from(s.keys.auth,'base64url'),ec=createECDH('prime256v1');ec.generateKeys();const pub=ec.getPublicKey(),salt=randomBytes(16),secret=ec.computeSecret(client);
 const ikm=Buffer.from(hkdfSync('sha256',secret,auth,Buffer.concat([Buffer.from('WebPush: info\0'),client,pub]),32));
 const key=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16)),nonce=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
 const data=Buffer.from(JSON.stringify(json));if(data.length>3000)throw Error('Push payload too large');const c=createCipheriv('aes-128-gcm',key,nonce),encrypted=Buffer.concat([c.update(Buffer.concat([data,Buffer.from([2])])),c.final(),c.getAuthTag()]);
 const size=Buffer.alloc(4);size.writeUInt32BE(4096);return Buffer.concat([salt,size,Buffer.from([65]),pub,encrypted]);
}
export async function sendPush(s,payload,vapid,fetcher=fetch){
 subscription(s);const audience=new URL(s.endpoint).origin,header=Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url'),body=Buffer.from(JSON.stringify({aud:audience,exp:Math.floor(Date.now()/1000)+12*3600,sub:'https://arisconstantinou.github.io/codex/'})).toString('base64url'),token=`${header}.${body}`,signature=sign('sha256',Buffer.from(token),{key:createPrivateKey({key:vapid.privateKey,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');
 const response=await fetcher(s.endpoint,{method:'POST',headers:{Authorization:`vapid t=${token}.${signature}, k=${vapid.publicKey}`,'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:'86400',Urgency:'normal'},body:encrypt(s,payload),signal:AbortSignal.timeout(15000)});
 if(!response.ok){const e=Error(`Push HTTP ${response.status}`);e.status=response.status;throw e}return {status:response.status};
}
