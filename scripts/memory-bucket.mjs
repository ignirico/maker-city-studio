import { createHash } from 'node:crypto';
export class MemoryBucket {
  objects=new Map();
  async put(key,value,options={}) {
    const previous=this.objects.get(key), condition=options.onlyIf;
    if(condition?.etagDoesNotMatch==='*'&&previous)return null;
    if(condition?.etagMatches&&condition.etagMatches!==previous?.etag)return null;
    const bytes=new Uint8Array(await new Response(value).arrayBuffer());
    const etag=createHash('sha256').update(bytes).digest('hex');
    const object={bytes,etag,httpMetadata:options.httpMetadata||{}};this.objects.set(key,object);return {etag};
  }
  async get(key,options={}) {
    const object=this.objects.get(key);if(!object)return null;
    let data=object.bytes,range;
    const header=options.range?.get?.('Range'),match=header?.match(/^bytes=(\d+)-(\d*)$/);
    if(match){const offset=Number(match[1]),end=match[2]?Math.min(Number(match[2]),data.length-1):data.length-1;range={offset,length:end-offset+1};data=data.slice(offset,end+1);}
    return {etag:object.etag,httpEtag:'"'+object.etag+'"',size:object.bytes.length,range,body:data,json:async()=>JSON.parse(new TextDecoder().decode(object.bytes)),writeHttpMetadata:headers=>Object.entries(object.httpMetadata).forEach(([k,v])=>headers.set(k==='contentType'?'Content-Type':'Cache-Control',v))};
  }
}
