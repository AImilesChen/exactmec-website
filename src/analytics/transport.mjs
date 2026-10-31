export const MEASUREMENT_CHOICE_KEY='exactmec_measurement_choice_v4';
export const MEASUREMENT_WITHDRAWAL_HASH='#measurement-declined';
const probe='exactmec_measurement_storage_check';
export function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function readSavedMeasurementChoice(storage,location=globalThis.location){
 if(location?.hash===MEASUREMENT_WITHDRAWAL_HASH){saveMeasurementChoice(storage,false);return 'deny';}
 try{
  const value=storage?.getItem(MEASUREMENT_CHOICE_KEY);
  if(value==='deny')return 'deny';
  if(value!=='allow')return null;
  // Read-only storage must not revive an old allowance after a failed withdrawal.
  storage.setItem(probe,'check');if(storage.getItem(probe)!=='check')return null;
  storage.removeItem(probe);if(storage.getItem(probe)!=null)return null;
  return 'allow';
 }catch{return null;}
}
export function readMeasurementChoice(storage,location=globalThis.location){return readSavedMeasurementChoice(storage,location)==='allow';}
export function saveMeasurementChoice(storage,allow){try{const value=allow?'allow':'deny';storage?.setItem(MEASUREMENT_CHOICE_KEY,value);return storage?.getItem(MEASUREMENT_CHOICE_KEY)===value;}catch{return false;}}
export function createFirstPartyTransport({fetchImpl=globalThis.fetch}={}){
 return (event,payload)=>fetchImpl('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',keepalive:true,body:JSON.stringify({event,payload,choice:'allow'})}).then(()=>{}).catch(()=>{});
}
