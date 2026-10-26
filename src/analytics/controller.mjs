import {createAnalytics} from './index.mjs';
import {MEASUREMENT_WITHDRAWAL_HASH} from './transport.mjs';

export function navigateForExternalMeasurement(window,target){
 const next=new URL(target,window.location.href);
 if(next.origin!==window.location.origin)return false;
 const fragmentNavigation=next.pathname===window.location.pathname&&next.search===window.location.search&&next.hash!==window.location.hash;
 window.location.assign(next.pathname+next.search+next.hash);
 if(fragmentNavigation)window.location.reload();
 return true;
}

/** One consent decision controls the separately gated first-party and vendor transports. */
export function createMeasurementController({firstPartyEnabled=false,externalEnabled=false,firstPartyTransport,vendors,window=globalThis.window}={}){
 const core=createAnalytics({enabled:firstPartyEnabled,adapter:firstPartyTransport});
 let destroyed=false,permitted=false;
 return Object.freeze({
  track(name,payload){
   const firstParty=core.track(name,payload);
   let external=false;
   if(!destroyed&&permitted&&externalEnabled)try{external=vendors?.track(name,payload)===true;}catch{}
   return firstParty||external;
  },
  setConsent(allow){
   if(destroyed)return;
   const reload=allow!==true&&externalEnabled&&vendors?.hasStarted()===true;
   if(allow===true&&window?.location?.hash===MEASUREMENT_WITHDRAWAL_HASH){
    window.history?.replaceState(null,'',window.location.pathname+(window.location.search||''));
   }
   permitted=allow===true;core.setConsent(allow);
   if(externalEnabled)vendors?.setConsent(allow===true);
   if(reload&&window?.location?.origin==='https://exactmec.com'){
    // A fresh document removes SDK event listeners. The marker prevents an old
    // read-only allowance from returning when preference storage cannot update.
    window.location.replace(window.location.pathname+(window.location.search||'')+MEASUREMENT_WITHDRAWAL_HASH);
    window.location.reload();
   }
  },
  destroy(){if(destroyed)return;destroyed=true;permitted=false;core.destroy();vendors?.destroy();},
 });
}
