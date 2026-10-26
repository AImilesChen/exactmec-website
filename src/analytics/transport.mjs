const key='exactmec_measurement_choice';
export function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function readMeasurementChoice(storage){try{return storage?.getItem(key)==='allow';}catch{return false;}}
export function saveMeasurementChoice(storage,allow){try{storage?.setItem(key,allow?'allow':'deny');}catch{/* Choice still applies to this page. */}}
export function createFirstPartyTransport({fetchImpl=globalThis.fetch}={}){
 return (event,payload)=>fetchImpl('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',keepalive:true,body:JSON.stringify({event,payload,choice:'allow'})}).then(()=>{}).catch(()=>{});
}
