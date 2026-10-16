import {uploadResumable,uploadToNode,fileFingerprint} from './upload.js';
import {hashFile} from './file-hash.js';

/** Browser Files stay in memory; durable server IDs and resumable sessions survive a refresh. */
export function createUploadManager({api,key,onChange=()=>{},storage=globalThis.sessionStorage,concurrency=4}) {
    let records;try{records=JSON.parse(storage.getItem(key))||[];}catch{records=[];}
    if(!Array.isArray(records))records=[];
    const files=new Map(),running=new Map(),removed=new Set();let stopped=false,persistenceError='';
    for(const record of records)if(['queued','receiving','hashing'].includes(record.status))record.status='paused';
    const save=()=>{try{storage.setItem(key,JSON.stringify(records));persistenceError='';}catch{persistenceError='浏览器缓存不可写；服务端任务仍保留，刷新后需重新关联原文件。';}onChange(records);};
    async function report(record,status=record.status){if(record.mode==='gcs'&&record.server?.id){const result=await api('/uploads/progress',{id:record.server.id,done:record.done||0,speed:record.speed||0,status});if(['paused','cancelled'].includes(result.status))running.get(record.id)?.abort();}}
    async function run(record){
        const controller=new AbortController();running.set(record.id,controller);
        const signal=controller.signal,file=files.get(record.id);
        try {
            record.error='';record.status=record.sha256?'receiving':'hashing';record.speed=0;save();
            if(!record.sha256)record.sha256=await hashFile(file,{signal,onProgress:done=>{record.hash_done=done;onChange(records);}});
            signal.throwIfAborted();
            if(record.server?.id)record.server=await api(record.mode==='gcs'?'/uploads/session':'/local-uploads/session',{id:record.server.id});
            else record.server=await api(record.mode==='gcs'?'/uploads':'/local-uploads',{mode:record.mode,filename:file.name,size:file.size,duration_seconds:record.duration,sha256:record.sha256});
            if(record.server.pending){record.transferred=true;record.status='background';record.done=0;save();return;}
            record.status='receiving';record.total=file.size;save();
            if(!record.server.reused){
                let sample=[performance.now(),record.done||0],lastReport=0;
                await(record.mode==='gcs'?uploadResumable:uploadToNode)(file,record.server.session,{signal,chunkSize:record.server.chunk_size, onProgress:(done,total)=>{
                    const now=performance.now(),elapsed=(now-sample[0])/1000;
                    if(elapsed>=.5){record.speed=Math.max(0,(done-sample[1])/elapsed);sample=[now,done];}
                    Object.assign(record,{done,total,eta:record.speed?(total-done)/record.speed:null,progress_at:Date.now()/1000});save();
                    if(now-lastReport>1000){lastReport=now;void report(record).catch(()=>{});}
                }});
                signal.throwIfAborted();
                if(record.mode==='gcs')await report(record);
                else await api('/local-uploads/finish',{id:record.server.id});
            }
            record.done=file.size;record.transferred=true;record.status=record.mode==='gcs'||record.server.reused?'complete':'background';record.speed=0;save();
        } catch(error){
            if(!removed.has(record.id)){const paused=signal.aborted||error.code==='PAUSED';record.status=paused?'paused':'failed';record.speed=0;record.error=paused?'':error.message;save();try{await report(record);}catch{}}
        } finally {running.delete(record.id);pump();}
    }
    function pump(){if(stopped)return;for(const record of records){if(running.size>=concurrency)break;if(record.status==='queued'&&files.has(record.id)&&!running.has(record.id))void run(record);}}
    async function operate(id,operation){
        const record=records.find(r=>r.id===id);if(!record)return;
        if(operation==='pause'){
            running.get(id)?.abort();record.status='paused';record.speed=0;save();
            if(record.server?.id)await api('/tasks/'+encodeURIComponent(record.server.id)+'/pause',{});return;
        }
        if(operation==='delete'||operation==='cancel'){
            removed.add(id);running.get(id)?.abort();
            if(record.server?.id)await api('/tasks/'+encodeURIComponent(record.server.id)+'/'+operation,{});
            if(operation==='delete'){records=records.filter(r=>r.id!==id);files.delete(id);}else record.status='cancelled';save();return;
        }
        if(record.transferred&&record.server?.id&&record.mode!=='gcs'){
            await api('/tasks/'+encodeURIComponent(record.server.id)+'/resume',{});record.status='background';record.error='';save();return;
        }
        if(!files.has(id))throw Error('请重新选择原文件，再点击继续；会核对内容后从已确认的位置接续。');
        // Refuse a same-name/same-size replacement whose contents changed after a refresh.
        if(record.sha256&&!record.verified){const digest=await hashFile(files.get(id));if(digest!==record.sha256){files.delete(id);throw Error('文件内容与原任务不一致，不能续传。');}record.verified=true;}
        removed.delete(id);record.status='queued';record.error='';save();pump();
    }
    return {get records(){return records;},get persistenceError(){return persistenceError;},add(selected,{mode,duration=null,maxBytes=Infinity}={}){
        for(const file of selected){if(file.size>maxBytes||!file.size)throw Error('文件为空或超过上传大小上限。');
            const fingerprint=fileFingerprint(file);const old=records.find(r=>(r.fingerprint===fingerprint||!r.fingerprint&&r.filename===file.name&&r.total===file.size)&&r.mode===mode&&!['complete','cancelled'].includes(r.status));
            if(old){files.set(old.id,file);old.fingerprint=fingerprint;old.verified=false;continue;}
            const id=globalThis.crypto.randomUUID?.()||[...globalThis.crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(16).padStart(8,'0')).join(''),record={id,filename:file.name,title:file.name,fingerprint,mode,duration,status:'queued',done:0,total:file.size,created:Date.now()};records.push(record);files.set(id,file);
        }save();pump();},operate,hasFile:id=>files.has(id),findServer:id=>records.find(r=>r.server?.id===id),
        setConcurrency(value){if(!Number.isInteger(value)||value<1||value>8)throw Error('上传并发需为 1–8');concurrency=value;pump();},
        stop(){stopped=true;for(const controller of running.values())controller.abort();},
        sync(tasks){
            for(const remote of tasks.filter(t=>t.browser_upload))if(!records.some(r=>r.server?.id===remote.id)){
                records.push({...remote,id:'server:'+remote.id,server:{id:remote.id},filename:remote.title||remote.video?.title||'上传文件',mode:remote.upload_mode||'gcs',sha256:remote.content_sha256,transferred:Boolean(remote.browser_received)||remote.status==='complete'});
            }
            for(const record of records){const remote=tasks.find(t=>t.id===record.server?.id);if(!remote)continue;
            if(['paused','cancelled'].includes(remote.status)&&running.has(record.id))running.get(record.id).abort();
            if(!running.has(record.id)&&(record.transferred||record.id.startsWith('server:')||['cancelled','complete','expired'].includes(remote.status))){Object.assign(record,{...remote,id:record.id,server:record.server});record.transferred=record.transferred||Boolean(remote.browser_received);}
        }save();}
    };
}
