import test from 'node:test';
import assert from 'node:assert/strict';
import {pushSetupModel,pushSetupPanel,pushSetupCard} from '../public/shared/push-setup.mjs';
const ready={ios:true,standalone:true,supported:true,permission:'default',backendConfigured:true,serverReady:true,online:true};
test('An ordinary iPhone tab guides Home Screen installation before requesting permission',()=>{
 const e={...ready,standalone:false};assert.equal(pushSetupModel(e).stage,'install');assert.equal(pushSetupModel(e).enable,false);assert.match(pushSetupPanel(e),/data-action="enable-push" disabled/);
});
test('Home Screen app can opt in only with supported push, connected backend and internet',()=>{
 assert.equal(pushSetupModel(ready).enable,true);
 for(const e of [{supported:false},{backendConfigured:false},{serverReady:false},{online:false},{permission:'denied'}])assert.equal(pushSetupModel({...ready,...e}).enable,false);
});
test('A subscription is not presented as verified iOS display, and expired subscriptions require renewal',()=>{
 const connected={...ready,subscribed:true};assert.match(pushSetupPanel(connected),/δεν αποδεικνύει/);assert.equal(pushSetupCard(connected),'');assert.equal(pushSetupModel({...connected,expired:true}).stage,'enable');assert.match(pushSetupPanel({...connected,expired:true}),/data-action="test-push" disabled/);
});
